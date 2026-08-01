//	Browser client for JSONables clusters, served statically.

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

	URL( id ) {
		return this.base + encodeURIComponent( id )
	}

	async get( id )			{ return ( await ThrowOnError( await fetch( this.URL( id ) ) ) ).json() }
	async post( record )		{ return ( await ThrowOnError( await fetch( this.base, { method: 'POST', body: JSON.stringify( record ) } ) ) ).json() }
	async put( id, record )	{ return ThrowOnError( await fetch( this.URL( id ), { method: 'PUT', body: JSON.stringify( record ) } ) ) }
	async del( id )			{ return ThrowOnError( await fetch( this.URL( id ), { method: 'DELETE' } ) ) }

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

	async getObject( id ) {
		return this.Zip( await this.fields(), await this.get( id ) )
	}

	async putObject( id, object ) {
		return this.put( id, this.Unzip( await this.fields(), object ) )
	}

	async postObject( object ) {
		return this.post( this.Unzip( await this.fields(), object ) )
	}

	async listObjects( params = {} ) {
		const
		fields = await this.fields()
		return ( await this.list( params ) ).map( ( [ key, record ] ) => [ key, this.Zip( fields, record ) ] )
	}
}
