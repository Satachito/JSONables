//	JSONables server: mounts every table found under data/ as /db/{cluster}/{table}
//	and serves the repo root statically.
//
//	Usage: node --max-old-space-size=4096 server/main.js  (or: npm start)

import fs	from 'fs'
import path	from 'path'
import url	from 'url'

import {
	API_STATIC_SERVER
,	_403
} from '../SAT/Bullet.js'

import {
	MemoryCluster
,	IndexedCluster
} from '../jsonables/cluster.js'
import { DBRoutes }			from './routes-db.js'
import { APIRoutes }		from './routes-api.js'
import { SQLRoutes }		from './routes-sql.js'

const
ROOT = path.resolve( path.dirname( url.fileURLToPath( import.meta.url ) ), '..' )

const
DATA = path.join( ROOT, 'data' )

//	jv is immutable JV-Data — everything else accepts writes.
const
WritableDB = db => db !== 'jv'

const
clusters = {}

for ( const db of fs.existsSync( DATA ) ? fs.readdirSync( DATA ) : [] ) {
	const
	dir = path.join( DATA, db )
	if ( !fs.statSync( dir ).isDirectory() || db === 'cache' ) continue

	for ( const file of fs.readdirSync( dir ) ) {
		if ( !file.endsWith( '.meta.json' ) ) continue
		const
		table = file.slice( 0, -'.meta.json'.length )

		//	Tables with a prebuilt .idx are read from disk on demand instead of held in memory.
		;( clusters[ db ] ??= {} )[ table ] = fs.existsSync( path.join( dir, `${ table }.idx` ) )
		?	await new IndexedCluster( dir, table ).load()
		:	await new MemoryCluster( dir, table, { writable: WritableDB( db ) } ).load()
	}
}

for ( const db in clusters ) console.log( `${ db }: ${ Object.keys( clusters[ db ] ).map( t => `${ t }(${ clusters[ db ][ t ].recordCount() })` ).join( ' ' ) }` )
console.log( `heap: ${ ( process.memoryUsage().heapUsed / 1024 / 1024 ).toFixed( 0 ) }MB` )

const
APIs = {
	...DBRoutes( clusters )
,	...APIRoutes( clusters )
,	...SQLRoutes( clusters )
,	'/data/': async ( Q, S ) => _403( S )	//	raw data files are not served statically
}

const
PORT = process.env.PORT || 8080

API_STATIC_SERVER( APIs, ROOT ).listen( PORT, () => console.log( `JSONables server: http://localhost:${ PORT }/` ) )
