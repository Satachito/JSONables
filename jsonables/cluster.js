//	JSONables clusters: one cluster per table.
//
//	On disk:
//		<dir>/<table>.jsonl        one JSONable per line (Legacy: array, Full: object)
//		<dir>/<table>.meta.json    { style, fields?, types?, keyFields }
//		<dir>/<table>.log.jsonl    write log: {"op":"put"|"del","key":k,"record":...}
//
//	In memory records are kept as raw JSON line strings — GET is zero-parse.

import fs		from 'fs'
import fsp		from 'fs/promises'
import readline	from 'readline'
import path		from 'path'

import { DeriveKey } from './key.js'

const
EachLine = async ( file, F ) => {
	const
	$ = readline.createInterface( { input: fs.createReadStream( file ), crlfDelay: Infinity } )
	for await ( const line of $ ) if ( line.length ) F( line )
}

export class
MemoryCluster {

	constructor( dir, table, { writable = false } = {} ) {
		this.dir		= dir
		this.table		= table
		this.writable	= writable
		this.basePath	= path.join( dir, `${ table }.jsonl` )
		this.metaPath	= path.join( dir, `${ table }.meta.json` )
		this.logPath	= path.join( dir, `${ table }.log.jsonl` )
		this.map		= new Map()
		this.logFD		= null
	}

	async load() {
		this.metaData = JSON.parse( await fsp.readFile( this.metaPath, 'utf8' ) )

		//	revisionField (e.g. head_MakeDate on JV data): a key's record with the highest
		//	revision wins, later lines winning ties.
		const
		revField = this.metaData.revisionField
	,	revs = revField ? new Map() : null

		if ( fs.existsSync( this.basePath ) ) await EachLine(
			this.basePath
		,	line => {
				const
				record = JSON.parse( line )
			,	key = DeriveKey( record, this.metaData )
				if ( revs ) {
					const
					rev = record[ revField ] ?? ''
					if ( ( revs.get( key ) ?? '' ) > rev ) return
					revs.set( key, rev )
				}
				this.map.set( key, line )
			}
		)

		if ( fs.existsSync( this.logPath ) ) await EachLine(
			this.logPath
		,	line => {
				const { op, key, record } = JSON.parse( line )
				op === 'del'
				?	this.map.delete( key )
				:	this.map.set( key, JSON.stringify( record ) )
			}
		)

		if ( this.writable ) this.logFD = fs.openSync( this.logPath, 'a' )
		return this
	}

	AppendLog( op, key, record ) {
		fs.writeSync( this.logFD, JSON.stringify( { op, key, record } ) + '\n' )
		fs.fsyncSync( this.logFD )
	}

	AssertWritable() {
		if ( !this.writable ) throw Object.assign( new Error( `${ this.table } is read-only` ), { status: 405 } )
	}

	//	Returns the raw JSON line string, or undefined.
	get( key ) {
		return this.map.get( key )
	}

	has( key ) {
		return this.map.has( key )
	}

	post( key, record ) {
		this.AssertWritable()
		if ( this.map.has( key ) ) throw Object.assign( new Error( `Key exists: ${ key }` ), { status: 409 } )
		this.map.set( key, JSON.stringify( record ) )
		this.AppendLog( 'put', key, record )
	}

	put( key, record ) {
		this.AssertWritable()
		this.map.set( key, JSON.stringify( record ) )
		this.AppendLog( 'put', key, record )
	}

	del( key ) {
		this.AssertWritable()
		if ( !this.map.delete( key ) ) throw Object.assign( new Error( `No such key: ${ key }` ), { status: 404 } )
		this.AppendLog( 'del', key )
	}

	//	Yields [ key, rawLine ] for keys starting with prefix ('' = all).
	* scan( prefix = '' ) {
		for ( const [ key, line ] of this.map ) if ( key.startsWith( prefix ) ) yield [ key, line ]
	}

	recordCount() {
		return this.map.size
	}

	meta() {
		return { ...this.metaData, recordCount: this.map.size }
	}
}

//	Read-only cluster over a large .jsonl whose records are read from disk on demand,
//	via a prebuilt <table>.idx (see tools/build-jv-index.js): JSONL of [ key, offset, len ].
//	Optional secondary indexes: <table>.<name>.idx, JSONL of [ value, [ keys... ] ],
//	exposed through lookup( name, value ) → keys.
export class
IndexedCluster {

	constructor( dir, table ) {
		this.dir		= dir
		this.table		= table
		this.basePath	= path.join( dir, `${ table }.jsonl` )
		this.metaPath	= path.join( dir, `${ table }.meta.json` )
		this.idxPath	= path.join( dir, `${ table }.idx` )
		this.map		= new Map()	//	key → [ offset, len ]
		this.secondary	= {}
	}

	async load() {
		this.metaData = JSON.parse( await fsp.readFile( this.metaPath, 'utf8' ) )

		await EachLine(
			this.idxPath
		,	line => {
				const [ key, offset, len ] = JSON.parse( line )
				this.map.set( key, [ offset, len ] )
			}
		)
		this.sortedKeys = [ ...this.map.keys() ].sort()
		this.fd = fs.openSync( this.basePath, 'r' )

		for ( const file of fs.readdirSync( this.dir ) ) {
			const
			match = file.match( new RegExp( `^${ this.table }\\.(\\w+)\\.idx$` ) )
			if ( !match ) continue
			const
			index = new Map()
			await EachLine( path.join( this.dir, file ), line => {
				const [ value, keys ] = JSON.parse( line )
				index.set( value, keys )
			} )
			this.secondary[ match[ 1 ] ] = index
		}
		return this
	}

	ReadLine( [ offset, len ] ) {
		const
		buffer = Buffer.alloc( len )
		fs.readSync( this.fd, buffer, 0, len, offset )
		return buffer.toString( 'utf8' )
	}

	get( key ) {
		const
		entry = this.map.get( key )
		return entry && this.ReadLine( entry )
	}

	has( key ) {
		return this.map.has( key )
	}

	lookup( name, value ) {
		return this.secondary[ name ]?.get( value ) ?? []
	}

	post()	{ throw Object.assign( new Error( `${ this.table } is read-only` ), { status: 405 } ) }
	put()	{ throw Object.assign( new Error( `${ this.table } is read-only` ), { status: 405 } ) }
	del()	{ throw Object.assign( new Error( `${ this.table } is read-only` ), { status: 405 } ) }

	* scan( prefix = '' ) {
		const
		keys = this.sortedKeys

		//	Lower bound of prefix by binary search.
		let low = 0, high = keys.length
		while ( low < high ) {
			const mid = ( low + high ) >>> 1
			keys[ mid ] < prefix ? low = mid + 1 : high = mid
		}
		for ( let i = low; i < keys.length && keys[ i ].startsWith( prefix ); i++ ) yield [ keys[ i ], this.ReadLine( this.map.get( keys[ i ] ) ) ]
	}

	recordCount() {
		return this.map.size
	}

	meta() {
		return { ...this.metaData, recordCount: this.map.size }
	}
}
