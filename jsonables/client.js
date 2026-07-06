//	Browser client for JSONables clusters. Served statically; import from apps as
//		import { Cluster, LegacyCluster } from '/jsonables/client.js'

const
ThrowOnError = async $ => {
	if ( !$.ok ) throw new Error( `${ $.status }: ${ await $.text() }` )
	return $
}

export class
Cluster {

	constructor( db, table ) {
		this.base = `/db/${ db }/${ table }/`
	}

	URL( key ) {
		return this.base + encodeURIComponent( key )
	}

	async get( key )			{ return ( await ThrowOnError( await fetch( this.URL( key ) ) ) ).json() }
	async post( key, record )	{ return ThrowOnError( await fetch( this.URL( key ), { method: 'POST'	, body: JSON.stringify( record ) } ) ) }
	async put( key, record )	{ return ThrowOnError( await fetch( this.URL( key ), { method: 'PUT'	, body: JSON.stringify( record ) } ) ) }
	async del( key )			{ return ThrowOnError( await fetch( this.URL( key ), { method: 'DELETE' } ) ) }

	async meta()				{ return ( await ThrowOnError( await fetch( this.base + 'meta' ) ) ).json() }
	async recordCount()			{ return ( await ThrowOnError( await fetch( this.base + 'meta/recordCount' ) ) ).json() }

	//	list( { prefix, limit, field, contains } ) → [ [ key, record ], ... ]
	async list( params = {} ) {
		const
		query = new URLSearchParams( Object.entries( params ).filter( ( [ , v ] ) => v !== undefined && v !== '' ) )
		return ( await ThrowOnError( await fetch( this.base + '?' + query ) ) ).json()
	}
}

//	Legacy-style cluster whose records are arrays: presents them as objects using meta.fields.
export class
LegacyCluster extends Cluster {

	async fields() {
		return this.$fields ??= await ( await ThrowOnError( await fetch( this.base + 'meta/fields' ) ) ).json()
	}

	Zip( fields, record ) {
		return Object.fromEntries( fields.map( ( f, i ) => [ f, record[ i ] ] ) )
	}

	Unzip( fields, object ) {
		return fields.map( f => object[ f ] ?? null )
	}

	async getObject( key ) {
		return this.Zip( await this.fields(), await this.get( key ) )
	}

	async putObject( key, object ) {
		return this.put( key, this.Unzip( await this.fields(), object ) )
	}

	async postObject( key, object ) {
		return this.post( key, this.Unzip( await this.fields(), object ) )
	}

	async listObjects( params = {} ) {
		const
		fields = await this.fields()
		return ( await this.list( params ) ).map( ( [ key, record ] ) => [ key, this.Zip( fields, record ) ] )
	}
}
