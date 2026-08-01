//	SQL-ish read API over loaded JSONables clusters.
//
//	Supported:
//		SELECT * | $id, $key, field... | count(*) FROM db.table
//		WHERE field (=|!=|<>|>|>=|<|<=|LIKE|CONTAINS) value [AND ...]
//		ORDER BY field [ASC|DESC]
//		LIMIT n

import { DeriveKey } from '../jsonables/key.js'

import {
	Send
,	SendJSONable
,	BodyAsJSON
,	_400
,	_405
} from '../SAT/Bullet.js'

const
MAX_ROWS = 10000

const
StripTrailingSemi = sql => sql.trim().replace( /;\s*$/, '' )

const
UnquoteIdentifier = value => value.trim().replace( /^`([^`]+)`$/, '$1' ).replace( /^"([^"]+)"$/, '$1' )

const
SplitComma = text => text.split( ',' ).map( _ => UnquoteIdentifier( _ ) ).filter( Boolean )

const
ParseValue = raw => {
	const
	value = raw.trim()
	if ( /^'(?:''|[^'])*'$/.test( value ) ) return value.slice( 1, -1 ).replace( /''/g, "'" )
	if ( /^"(?:\\"|[^"])*"$/.test( value ) ) return value.slice( 1, -1 ).replace( /\\"/g, '"' )
	if ( /^(true|false)$/i.test( value ) ) return /^true$/i.test( value )
	if ( /^null$/i.test( value ) ) return null
	if ( /^-?\d+(?:\.\d+)?$/.test( value ) ) return Number( value )
	return UnquoteIdentifier( value )
}

const
ParseWhere = where => {
	if ( !where ) return []
	return where.split( /\s+AND\s+/i ).map( clause => {
		const
		match = clause.match( /^\s*(`[^`]+`|"[^"]+"|[\w$]+)\s*(>=|<=|<>|!=|=|>|<|LIKE|CONTAINS)\s*(.+?)\s*$/i )
		if ( !match ) throw Object.assign( new Error( `Unsupported WHERE clause: ${ clause }` ), { status: 400 } )
		return {
			field	: UnquoteIdentifier( match[ 1 ] )
		,	op		: match[ 2 ].toUpperCase()
		,	value	: ParseValue( match[ 3 ] )
		}
	} )
}

const
ParseSQL = sql => {
	const
	text = StripTrailingSemi( sql )
	,	match = text.match(
		/^SELECT\s+([\s\S]+?)\s+FROM\s+(`[^`]+`|"[^"]+"|[\w-]+)(?:\s*\.\s*(`[^`]+`|"[^"]+"|[\w-]+))?(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+(`[^`]+`|"[^"]+"|[\w$]+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?\s*$/i
	)
	if ( !match ) throw Object.assign( new Error( 'Only SELECT ... FROM db.table ... queries are supported.' ), { status: 400 } )
	if ( !match[ 3 ] ) throw Object.assign( new Error( 'FROM must be db.table, for example oldmac.o_jockey.' ), { status: 400 } )

	return {
		columns		: match[ 1 ].trim() === '*' ? [ '*' ] : SplitComma( match[ 1 ] )
	,	db			: UnquoteIdentifier( match[ 2 ] )
	,	table		: UnquoteIdentifier( match[ 3 ] )
	,	where		: ParseWhere( match[ 4 ] )
	,	orderBy		: match[ 5 ] ? UnquoteIdentifier( match[ 5 ] ) : null
	,	orderDir	: ( match[ 6 ] ?? 'ASC' ).toUpperCase()
	,	limit		: match[ 7 ] ? Number( match[ 7 ] ) : 1000
	}
}

const
RecordObject = ( meta, id, line ) => {
	const
	record = JSON.parse( line )
	,	object = meta.style === 'legacy' && Array.isArray( record )
		? Object.fromEntries( ( meta.fields ?? [] ).map( ( field, i ) => [ field, record[ i ] ] ) )
		: record
	,	key = meta.keyFields ? DeriveKey( record, meta ) : null
	return { $id: id, $key: key, ...object }
}

const
Compare = ( left, op, right ) => {
	if ( op === 'LIKE' ) {
		const
		pattern = String( right )
			.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' )
			.replace( /[%_]/g, match => match === '%' ? '.*' : '.' )
		return new RegExp( `^${ pattern }$`, 'i' ).test( String( left ?? '' ) )
	}
	if ( op === 'CONTAINS' ) return String( left ?? '' ).includes( String( right ) )
	if ( op === '=' ) return left == right
	if ( op === '!=' || op === '<>' ) return left != right
	if ( left == null || right == null ) return false
	const
	a = typeof left === 'number' && typeof right === 'number' ? left : String( left )
	,	b = typeof left === 'number' && typeof right === 'number' ? right : String( right )
	switch ( op ) {
	case '>'	: return a > b
	case '>='	: return a >= b
	case '<'	: return a < b
	case '<='	: return a <= b
	default		: return false
	}
}

const
Matches = ( row, conditions ) => conditions.every( condition => Compare( row[ condition.field ], condition.op, condition.value ) )

//	JSON.parse を避けるための素通しフィルタ。
//	=/CONTAINS の値が JSON でそのまま現れる文字列なら、生の行に含まれない
//	レコードは絶対に一致しないので、パースせずに捨てられる。
//	（"や\、制御文字を含む値はエスケープで表記が変わり得るので対象外）
const
RawProbes = conditions => conditions
	.filter( c => ( c.op === '=' || c.op === 'CONTAINS' )
		&& typeof c.value === 'string'
		&& c.value.length > 0
		&& ![ ...c.value ].some( ch => ch < ' ' || ch === '"' || ch === '\\' )
	)
	.map( c => c.value )

const
ProjectColumns = ( query, meta ) => {
	if ( query.columns.length === 1 && /^count\s*\(\s*\*\s*\)$/i.test( query.columns[ 0 ] ) ) return [ 'count' ]
	if ( query.columns[ 0 ] === '*' ) return [ '$id', '$key', ...( meta.fields ?? [] ) ]
	return query.columns
}

const
RunQuery = ( clusters, sql ) => {
	const
	query = ParseSQL( sql )
	,	cluster = clusters[ query.db ]?.[ query.table ]
	if ( !cluster ) throw Object.assign( new Error( `Unknown JSONables table: ${ query.db }.${ query.table }` ), { status: 404 } )

	const
	meta = cluster.meta()
	,	isCount = query.columns.length === 1 && /^count\s*\(\s*\*\s*\)$/i.test( query.columns[ 0 ] )
	,	columns = ProjectColumns( query, meta )
	,	cap = Math.min( query.limit, MAX_ROWS )

	//	条件なしの件数は走査せず索引の件数を返す。
	if ( isCount && !query.where.length ) {
		return { columns, rows: [ { count: cluster.recordCount() } ], scanned: cluster.recordCount(), returned: 1 }
	}

	//	巨大レコード（gbiz.hojin は1社が数MBになる）をそのまま溜めると即OOMになるため、
	//	一致した時点で必要な列だけに射影して保持する。
	const
		//	並べ替えキーは結果に出さなくても保持が要る
	keep = query.orderBy && !columns.includes( query.orderBy ) ? [ ...columns, query.orderBy ] : columns
	,	Project = ( row, fields ) => Object.fromEntries( fields.map( field => [ field, row[ field ] ?? null ] ) )
	,	probes = RawProbes( query.where )
	,	rows = []
	let
	count = 0

	for ( const [ id, line ] of cluster.scan() ) {
		if ( probes.length && !probes.every( probe => line.includes( probe ) ) ) continue	//	パース前に足切り
		const
		row = RecordObject( meta, id, line )
		if ( !Matches( row, query.where ) ) continue
		count++
		if ( isCount ) continue
		rows.push( Project( row, keep ) )
		if ( !query.orderBy && rows.length >= cap ) break
	}

	if ( isCount ) return { columns, rows: [ { count } ], scanned: cluster.recordCount(), returned: 1 }

	if ( query.orderBy ) rows.sort( ( a, b ) => {
		const
		left = a[ query.orderBy ]
	,	right = b[ query.orderBy ]
	,	order = left === right ? 0 : left == null ? -1 : right == null ? 1 : left > right ? 1 : -1
		return query.orderDir === 'DESC' ? -order : order
	} )

	return {
		columns
	,	rows: rows.slice( 0, cap ).map( row => keep === columns ? row : Project( row, columns ) )
	,	scanned: cluster.recordCount()
	,	returned: Math.min( rows.length, cap )
	,	capped: query.limit > MAX_ROWS
	}
}

export const
SQLRoutes = clusters => ( {
	'/api/sql': async ( Q, S ) => {
		if ( Q.method !== 'POST' ) return _405( S )
		try {
			const
			{ sql } = await BodyAsJSON( Q )
			if ( !sql || typeof sql !== 'string' ) return _400( S, 'sql is required.' )
			SendJSONable( S, RunQuery( clusters, sql ) )
		} catch ( e ) {
			Send( S, e.status || 500, e.message )
		}
	}
,	'/api/sql/schema': async ( Q, S ) => {
		if ( Q.method !== 'GET' ) return _405( S )
		SendJSONable( S, Object.fromEntries( Object.entries( clusters ).map( ( [ db, tables ] ) => [
			db
		,	Object.fromEntries( Object.entries( tables ).map( ( [ table, cluster ] ) => [ table, cluster.meta() ] ) )
		] ) ) )
	}
} )
