//	App-specific APIs (joins/aggregations kept server-side).

import {
	Send
,	SendJSONable
,	BodyAsJSON
,	_400
,	_405
} from '../SAT/Bullet.js'

//	MasterEditor 'Leading Rank' (MainForm.cs btnLeadingRank_Click):
//	count KakuteiJyuni 1..5 per jockey over one year of confirmed results
//	(head_DataKubun = 7), sort by [1st..5th] desc, write rank 1..10 into
//	oldmac.o_jockey.LEADING (matching o_jockey.JRA = KisyuCode), zeroing the rest.
const
Leading = async ( clusters, year ) => {
	const
	se = clusters.jv.jv_se_race_uma
,	byJockey = new Map()	//	KisyuCode → { name, counts: [ 1st .. 5th ] }

	for ( const [ , line ] of se.scan( `${ year }|` ) ) {
		const
		record = JSON.parse( line )
		if ( record.head_DataKubun !== '7' ) continue
		const
		jyuni = Number( record.KakuteiJyuni )
		if ( jyuni < 1 || jyuni > 5 ) continue
		const
		entry = byJockey.get( record.KisyuCode ) ?? byJockey.set( record.KisyuCode, { name: record.KisyuRyakusyo, counts: [ 0, 0, 0, 0, 0 ] } ).get( record.KisyuCode )
		entry.counts[ jyuni - 1 ]++
	}
	if ( !byJockey.size ) throw Object.assign( new Error( `No confirmed results for ${ year }` ), { status: 400 } )

	const
	sorted = [ ...byJockey.entries() ].sort( ( [ , a ], [ , b ] ) => {
		for ( let i = 0; i < 5; i++ ) if ( a.counts[ i ] !== b.counts[ i ] ) return b.counts[ i ] - a.counts[ i ]
		return 0
	} )

	//	Tied count vectors share a rank; stop past rank 10.
	const
	ranking = []
	let
	rank = 1
,	previous = sorted[ 0 ][ 1 ].counts
	for ( let i = 0; i < sorted.length; i++ ) {
		const [ code, { name, counts } ] = sorted[ i ]
		if ( counts.some( ( c, j ) => c !== previous[ j ] ) ) {
			previous = counts
			rank = i + 1
		}
		if ( rank > 10 ) break
		ranking.push( { rank, KisyuCode: code, name, counts } )
	}

	//	Write LEADING into oldmac.o_jockey via the normal cluster write path.
	const
	jockeys = clusters.oldmac.o_jockey
,	meta = jockeys.meta()
,	iJRA = meta.fields.indexOf( 'JRA' )
,	iLEADING = meta.fields.indexOf( 'LEADING' )
,	rankByCode = new Map( ranking.map( _ => [ Number( _.KisyuCode ), _.rank ] ) )

	for ( const [ key, line ] of jockeys.scan() ) {
		const
		record = JSON.parse( line )
	,	next = rankByCode.get( Number( record[ iJRA ] ) ) ?? 0
		if ( record[ iLEADING ] !== next ) {
			record[ iLEADING ] = next
			jockeys.put( key, record )
		}
	}

	return ranking
}

export const
APIRoutes = clusters => ( {
	'/api/leading': async ( Q, S ) => {
		if ( Q.method !== 'POST' ) return _405( S )
		const
		{ year } = await BodyAsJSON( Q )
		if ( !/^\d{4}$/.test( String( year ) ) ) return _400( S, 'year must be YYYY' )
		try {
			SendJSONable( S, await Leading( clusters, String( year ) ) )
		} catch ( e ) {
			if ( !e.status ) throw e
			Send( S, e.status, e.message )
		}
	}
} )
