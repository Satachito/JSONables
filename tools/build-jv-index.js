//	Build byte-offset indexes for large jv tables so they can be served without
//	loading records into memory (IndexedCluster).
//
//	For each data/jv/<table>.jsonl over SIZE_THRESHOLD:
//		<table>.idx					JSONL of [ key, offset, len ] — one line per surviving key
//									(revisionField-aware: highest head_MakeDate wins, later line ties)
//		jv_se_race_uma.ketto.idx	JSONL of [ KettoNum, [ keys... ] ] — past-performance lookup
//
//	Small tables get no .idx and are loaded as MemoryCluster by the server.
//	Re-runnable; jv data is immutable after conversion.

import fs		from 'fs'
import path		from 'path'
import url		from 'url'
import readline	from 'readline'

import { DeriveKey } from '../jsonables/key.js'

const
ROOT = path.resolve( path.dirname( url.fileURLToPath( import.meta.url ) ), '..' )

const
DIR = path.join( ROOT, 'data', 'jv' )

const
SIZE_THRESHOLD = 64 * 1024 * 1024

const
SECONDARY = { jv_se_race_uma: { name: 'ketto', field: 'KettoNum' } }

const
WriteJSONL = async ( file, entries ) => {
	const
	out = fs.createWriteStream( file )
	for ( const entry of entries ) if ( !out.write( JSON.stringify( entry ) + '\n' ) ) await new Promise( R => out.once( 'drain', R ) )
	await new Promise( R => out.end( R ) )
}

for ( const file of fs.readdirSync( DIR ).sort() ) {
	if ( !file.endsWith( '.jsonl' ) ) continue

	const
	table = file.slice( 0, -'.jsonl'.length )
,	basePath = path.join( DIR, file )
,	idxPath = path.join( DIR, `${ table }.idx` )

	if ( fs.statSync( basePath ).size < SIZE_THRESHOLD ) {
		if ( fs.existsSync( idxPath ) ) fs.unlinkSync( idxPath )
		continue
	}

	const
	meta = JSON.parse( fs.readFileSync( path.join( DIR, `${ table }.meta.json` ), 'utf8' ) )
,	revField = meta.revisionField
,	secondary = SECONDARY[ table ]

	const
	map = new Map()		//	key → [ offset, len, rev, secondaryValue ]

	let
	offset = 0

	for await ( const line of readline.createInterface( { input: fs.createReadStream( basePath ), crlfDelay: Infinity } ) ) {
		const
		len = Buffer.byteLength( line, 'utf8' )
		if ( len ) {
			const
			record = JSON.parse( line )
		,	key = DeriveKey( record, meta )
		,	rev = revField ? record[ revField ] ?? '' : ''
			if ( ( map.get( key )?.[ 2 ] ?? '' ) <= rev ) map.set( key, [ offset, len, rev, secondary ? record[ secondary.field ] : null ] )
		}
		offset += len + 1
	}

	await WriteJSONL( idxPath, function* () { for ( const [ key, [ o, l ] ] of map ) yield [ key, o, l ] }() )

	if ( secondary ) {
		const
		byValue = new Map()
		for ( const [ key, [ , , , value ] ] of map ) {
			if ( !value ) continue
			byValue.has( value ) ? byValue.get( value ).push( key ) : byValue.set( value, [ key ] )
		}
		await WriteJSONL( path.join( DIR, `${ table }.${ secondary.name }.idx` ), function* () { for ( const [ value, keys ] of byValue ) yield [ value, keys ] }() )
		console.log( `${ table }.${ secondary.name }.idx: ${ byValue.size } values` )
	}

	console.log( `${ table }.idx: ${ map.size } keys` )
}
