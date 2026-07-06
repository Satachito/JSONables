//	Export oldmac + chuko from MySQL (Docker, 127.0.0.1:3306) to Legacy-style JSONables:
//	data/<db>/<table>.jsonl (one JSON array per line, column order = MySQL order) + .meta.json.
//
//	Read-only against MySQL. Tables without a primary key get a synthetic leading _id column.
//
//	Usage: node tools/export-mysql.js [db ...]   (default: oldmac chuko)

import fs	from 'fs'
import path	from 'path'
import url	from 'url'

import mysql from 'mysql2/promise'

import { AssertKeyable } from '../jsonables/key.js'

const
ROOT = path.resolve( path.dirname( url.fileURLToPath( import.meta.url ) ), '..' )

const
NUMERIC = new Set( [ 'int', 'bigint', 'mediumint', 'smallint', 'tinyint', 'decimal', 'float', 'double', 'year' ] )

const
TypeOf = ( dataType, columnType ) => columnType === 'tinyint(1)'
?	'Boolean'
:	NUMERIC.has( dataType ) ? 'Numeric' : 'String'

const
connection = await mysql.createConnection( {
	host		: '127.0.0.1'
,	port		: 3306
,	user		: 'chuko'
,	password	: 'chuko1234'
,	dateStrings	: true
} )

const
ExportTable = async ( db, table ) => {

	const
	[ columns ] = await connection.query(
		`SELECT c.COLUMN_NAME name, c.DATA_TYPE dataType, c.COLUMN_TYPE columnType, k.ORDINAL_POSITION pk
		FROM information_schema.columns c
		LEFT JOIN information_schema.key_column_usage k
			ON k.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.TABLE_NAME = c.TABLE_NAME
			AND k.COLUMN_NAME = c.COLUMN_NAME AND k.CONSTRAINT_NAME = 'PRIMARY'
		WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
		ORDER BY c.ORDINAL_POSITION`
	,	[ db, table ]
	)

	const
	keyColumns = columns.filter( _ => _.pk ).sort( ( a, b ) => a.pk - b.pk )
,	synthetic = !keyColumns.length

	const
	meta = {
		style		: 'legacy'
	,	fields		: [ ...synthetic ? [ '_id' ] : [], ...columns.map( _ => _.name ) ]
	,	types		: [ ...synthetic ? [ 'Numeric' ] : [], ...columns.map( _ => TypeOf( _.dataType, _.columnType ) ) ]
	,	keyFields	: synthetic ? [ '_id' ] : keyColumns.map( _ => _.name )
	}

	const
	keyIndices = meta.keyFields.map( f => meta.fields.indexOf( f ) )

	const
	dir = path.join( ROOT, 'data', db )
	fs.mkdirSync( dir, { recursive: true } )

	const
	out = fs.createWriteStream( path.join( dir, `${ table }.jsonl` ) )

	let
	count = 0

	//	rowsAsArray keeps column order; stream (non-promise API) to avoid buffering large tables.
	const
	stream = connection.connection.query( { sql: `SELECT * FROM \`${ db }\`.\`${ table }\``, rowsAsArray: true } ).stream()

	for await ( const row of stream ) {
		const
		record = synthetic ? [ ++count, ...row ] : ( ++count, row )
		for ( const i of keyIndices ) AssertKeyable( record[ i ] )
		if ( !out.write( JSON.stringify( record ) + '\n' ) ) await new Promise( R => out.once( 'drain', R ) )
	}
	await new Promise( R => out.end( R ) )

	fs.writeFileSync( path.join( dir, `${ table }.meta.json` ), JSON.stringify( meta, null, '\t' ) )
	console.log( `${ db }.${ table }: ${ count } rows` )
	return count
}

for ( const db of process.argv.length > 2 ? process.argv.slice( 2 ) : [ 'oldmac', 'chuko' ] ) {
	const
	[ tables ] = await connection.query( 'SELECT TABLE_NAME name FROM information_schema.tables WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [ db ] )
	for ( const { name } of tables ) await ExportTable( db, name )
}

await connection.end()
