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

		if ( fs.existsSync( this.basePath ) ) await EachLine(
			this.basePath
		,	line => this.map.set( DeriveKey( JSON.parse( line ), this.metaData ), line )
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
