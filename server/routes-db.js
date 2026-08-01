//	Generic JSONables CRUD over clusters, mounted at /db/ via Bullet.js prefix routing.
//
//		GET/PUT/DELETE		/db/{cluster}/{table}/{id}
//		POST				/db/{cluster}/{table}/
//		GET					/db/{cluster}/{table}/meta[/recordCount|/fields|/types]
//		GET					/db/{cluster}/{table}/?prefix=&limit=&field=&contains=
//
//	List responses are arrays of [ id, record ] pairs, streamed from raw lines (zero-parse
//	unless a field filter is given).

import {
	Send
,	SendJSONable
,	BodyAsJSON
,	QueryOf
,	_400
,	_404
,	_405
} from '../SAT/Bullet.js'

const
SendRaw = ( S, rawLine ) => Send( S, 200, rawLine, 'application/json' )

const
SendError = ( S, e ) => Send( S, e.status || 500, e.message )

const
Meta = ( S, cluster, rest ) => {
	const
	meta = cluster.meta()
	switch ( rest ) {
	case 'meta'				: return SendJSONable( S, meta )
	case 'meta/recordCount'	: return SendJSONable( S, cluster.recordCount() )
	case 'meta/fields'		: return meta.fields	? SendJSONable( S, meta.fields )	: _404( S )
	case 'meta/types'		: return meta.types		? SendJSONable( S, meta.types )		: _404( S )
	default					: return _404( S )
	}
}

const
List = ( S, cluster, query ) => {
	const
	prefix		= query.get( 'prefix' )		|| ''
,	limit		= query.has( 'limit' )		? Number( query.get( 'limit' ) ) : Infinity
,	field		= query.get( 'field' )
,	contains	= query.get( 'contains' )
,	equals		= query.get( 'equals' )

	let
	filter = null
	if ( field && ( contains || equals !== null ) ) {
		const
		meta = cluster.meta()
	,	index = meta.fields ? meta.fields.indexOf( field ) : -1
	,	Value = line => {
			const
			record = JSON.parse( line )
			return String( ( meta.style === 'legacy' ? record[ index ] : record[ field ] ) ?? '' )
		}
		filter = equals !== null ? line => Value( line ) === equals : line => Value( line ).includes( contains )
	}

	//	Secondary-index lookups (e.g. /db/jv/jv_se_race_uma/?ketto=<KettoNum>)
	let
	source = cluster.scan( prefix )
	for ( const name in cluster.secondary ?? {} ) if ( query.has( name ) ) {
		source = function* () {
			for ( const key of cluster.lookup( name, query.get( name ) ) ) if ( key.startsWith( prefix ) ) yield [ key, cluster.get( key ) ]
		}()
		break
	}

	const
	parts = []
	let
	count = 0
	for ( const [ key, line ] of source ) {
		if ( filter && !filter( line ) ) continue
		parts.push( `[${ JSON.stringify( key ) },${ line }]` )
		if ( ++count >= limit ) break
	}
	Send( S, 200, `[${ parts.join( ',' ) }]`, 'application/json' )
}

export const
DBRoutes = clusters => ( {
	'/db/': async ( Q, S, rest ) => {
		const
		slash = rest.indexOf( '/' )
		if ( slash < 0 ) return _404( S )

		const
		slash2 = rest.indexOf( '/', slash + 1 )
	,	clusterName = rest.slice( 0, slash )
	,	table = slash2 < 0 ? rest.slice( slash + 1 ) : rest.slice( slash + 1, slash2 )
	,	tail = slash2 < 0 ? null : rest.slice( slash2 + 1 )

		const
		cluster = clusters[ clusterName ]?.[ table ]
		if ( !cluster ) return _404( S )
		if ( tail === null ) return _404( S )

		try {
			if ( tail === '' ) {
				//	/db/{c}/{t}/  — list or generated-id create
				if ( Q.method === 'GET' ) return List( S, cluster, QueryOf( Q ) )
				if ( Q.method === 'POST' ) return SendJSONable( S, cluster.post( await BodyAsJSON( Q ) ) )
				return _405( S )
			}
			if ( tail === 'meta' || tail.startsWith( 'meta/' ) ) {
				if ( Q.method !== 'GET' ) return _405( S )
				return Meta( S, cluster, tail )
			}

			const
			id = tail
			switch ( Q.method ) {
			case 'GET': {
				const
				line = cluster.get( id )
				return line === undefined ? _404( S ) : SendRaw( S, line )
			}
			case 'PUT'		: return cluster.put( id, await BodyAsJSON( Q ) ), SendJSONable( S, true )
			case 'DELETE'	: return cluster.del( id ), SendJSONable( S, true )
			default			: return _405( S )
			}
		} catch ( e ) {
			return e instanceof SyntaxError ? _400( S, e.message ) : SendError( S, e )
		}
	}
} )
