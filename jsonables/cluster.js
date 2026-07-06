//	JSONables clusters: one cluster per table.
//
//	On disk:
//		<dir>/<table>.jsonl        one JSONable per line (Legacy: array, Full: object)
//		<dir>/<table>.meta.json    { style, fields?, types?, keyFields }
//		<dir>/<table>.log.jsonl    write log: {"op":"put"|"del","id":id,"record":...}
//
//	In memory records are kept as raw JSON line strings — GET is zero-parse.

import { randomUUID } from 'crypto'
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
		this.map		= new Map()	//	id → raw JSON line
		this.logical	= new Map()	//	derived keyFields key → id (legacy/import lookup)
		this.logFD		= null
		this.nextBaseId	= 1
	}

	GenerateID() {
		return `id-${ randomUUID() }`
	}

	BaseID() {
		return `base-${ this.nextBaseId++ }`
	}

	LogicalKey( record ) {
		return this.metaData.keyFields ? DeriveKey( record, this.metaData ) : null
	}

	SetRecord( id, record, line = JSON.stringify( record ) ) {
		this.map.set( id, line )
		const
		key = this.LogicalKey( record )
		if ( key !== null ) this.logical.set( key, id )
		return id
	}

	DeleteID( id ) {
		const
		line = this.map.get( id )
		if ( line !== undefined ) {
			const
			key = this.LogicalKey( JSON.parse( line ) )
			if ( key !== null && this.logical.get( key ) === id ) this.logical.delete( key )
		}
		return this.map.delete( id )
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
			,	key = this.LogicalKey( record )
			,	id = key === null ? this.BaseID() : this.logical.get( key ) ?? this.BaseID()
				if ( revs && key !== null ) {
					const
					rev = record[ revField ] ?? ''
					if ( ( revs.get( key ) ?? '' ) > rev ) return
					revs.set( key, rev )
				}
				this.SetRecord( id, record, line )
			}
		)

		if ( fs.existsSync( this.logPath ) ) await EachLine(
			this.logPath
		,	line => {
				const
				entry = JSON.parse( line )
			,	id = entry.id ?? this.logical.get( entry.key ) ?? entry.key
				entry.op === 'del'
				?	this.DeleteID( id )
				:	this.SetRecord( id, entry.record )
			}
		)

		if ( this.writable ) this.logFD = fs.openSync( this.logPath, 'a' )
		return this
	}

	AppendLog( op, id, record ) {
		fs.writeSync( this.logFD, JSON.stringify( { op, id, record } ) + '\n' )
		fs.fsyncSync( this.logFD )
	}

	AssertWritable() {
		if ( !this.writable ) throw Object.assign( new Error( `${ this.table } is read-only` ), { status: 405 } )
	}

	//	Returns the raw JSON line string, or undefined.
	get( id ) {
		return this.map.get( id )
	}

	has( id ) {
		return this.map.has( id )
	}

	getByKey( key ) {
		const
		id = this.logical.get( key )
		return id === undefined ? undefined : this.get( id )
	}

	hasKey( key ) {
		return this.logical.has( key )
	}

	post( record ) {
		this.AssertWritable()
		const
		id = this.GenerateID()
		this.SetRecord( id, record )
		this.AppendLog( 'put', id, record )
		return id
	}

	put( id, record ) {
		this.AssertWritable()
		if ( !this.map.has( id ) ) throw Object.assign( new Error( `No such id: ${ id }` ), { status: 404 } )
		this.DeleteID( id )
		this.SetRecord( id, record )
		this.AppendLog( 'put', id, record )
	}

	del( id ) {
		this.AssertWritable()
		if ( !this.DeleteID( id ) ) throw Object.assign( new Error( `No such id: ${ id }` ), { status: 404 } )
		this.AppendLog( 'del', id )
	}

	//	Yields [ id, rawLine ] for ids starting with prefix ('' = all).
	* scan( prefix = '' ) {
		for ( const [ id, line ] of this.map ) if ( id.startsWith( prefix ) ) yield [ id, line ]
	}

	//	Legacy/import lookup over keyFields-derived logical keys.
	* scanByKey( prefix = '' ) {
		for ( const [ key, id ] of this.logical ) if ( key.startsWith( prefix ) ) yield [ key, this.map.get( id ) ]
	}

	recordCount() {
		return this.map.size
	}

	meta() {
		return {
			...this.metaData
		,	recordCount		: this.map.size
		,	capabilities	: {
				postable	: this.writable
			,	putable		: this.writable
			,	deletable	: this.writable
			}
		}
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

	getByKey( key ) {
		return this.get( key )
	}

	hasKey( key ) {
		return this.has( key )
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

	scanByKey( prefix = '' ) {
		return this.scan( prefix )
	}

	recordCount() {
		return this.map.size
	}

	meta() {
		return {
			...this.metaData
		,	recordCount		: this.map.size
		,	capabilities	: {
				postable	: false
			,	putable		: false
			,	deletable	: false
			}
		}
	}
}
