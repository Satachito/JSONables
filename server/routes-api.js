//	App-specific APIs (joins/aggregations kept server-side).

import {
	Send
,	SendJSONable
,	BodyAsJSON
,	QueryOf
,	_400
,	_404
,	_405
} from '../SAT/Bullet.js'

import { TD, PH, AsInt, AsStr } from '../apps/shared/deumacodes.js'

//	Zip a Legacy-style raw line into an object using the cluster's field list.
const
ZipLegacy = ( cluster, line ) => {
	const
	fields = cluster.meta().fields
,	record = JSON.parse( line )
	return Object.fromEntries( fields.map( ( f, i ) => [ f, record[ i ] ] ) )
}

const
LegacyIDByKey = ( cluster, key ) => cluster.logical?.get( key )

const
LegacyByKey = ( cluster, key ) => {
	const
	id = LegacyIDByKey( cluster, key )
,	line = id === undefined ? undefined : cluster.get( id )
	return line === undefined ? null : { id, object: ZipLegacy( cluster, line ) }
}

const
LegacyScanByKey = ( cluster, prefix ) => {
	const
	rows = []
	for ( const [ key, line ] of cluster.scanByKey( prefix ) ) {
		const
		id = LegacyIDByKey( cluster, key )
		if ( id !== undefined ) rows.push( { id, object: ZipLegacy( cluster, line ) } )
	}
	return rows
}

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

///////////////////////////////	RaceResults

//	RA records of one race day, sorted by race number.
const
RacesOfDay = ( clusters, year, jyo, kaiji, nichiji ) => {
	const
	races = []
	for ( const [ , line ] of clusters.jv.jv_ra_race.scan( `${ year }|` ) ) {
		const
		r = JSON.parse( line )
		if ( r.id_JyoCD === jyo && +r.id_Kaiji === +kaiji && +r.id_Nichiji === +nichiji ) races.push( r )
	}
	return races.sort( ( a, b ) => +a.id_RaceNum - +b.id_RaceNum )
}

const
SEOfRace = ( clusters, ra ) => {
	const
	rows = []
	for ( const [ , line ] of clusters.jv.jv_se_race_uma.scan(
		`${ ra.id_Year }|${ ra.id_MonthDay }|${ ra.id_JyoCD }|${ ra.id_Kaiji }|${ ra.id_Nichiji }|${ ra.id_RaceNum }|`
	) ) rows.push( JSON.parse( line ) )
	return rows
}

//	oldmac key parts (numeric, unpadded) from jv-style parts.
const
OldmacRaceKey = ( jyo, year, kaiji, nichiji, racenum ) => `${ +jyo }|${ +year }|${ +kaiji }|${ +nichiji }|${ +racenum }`

//	Merged result rows for the ResultDrawer — the C# GetRaceHorse 4-table join.
const
ResultData = ( clusters, { year, jyo, kaiji, nichiji, racenum } ) => {
	const
	ra = RacesOfDay( clusters, year, jyo, kaiji, nichiji ).find( r => +r.id_RaceNum === +racenum )
	if ( !ra || ![ '7', 'A', 'B' ].includes( ra.head_DataKubun ) ) return null

	const
	oRace = clusters.oldmac.o_race
,	oRaceLine = oRace.getByKey( OldmacRaceKey( jyo, year, kaiji, nichiji, racenum ) )
	if ( !oRaceLine ) return null
	const
	ora = ZipLegacy( oRace, oRaceLine )

	const
	se = new Map( SEOfRace( clusters, ra ).map( h => [ +h.Umaban, h ] ) )

	const
	orh = clusters.oldmac.o_race_horse
,	comments = clusters.oldmac.o_comment
,	newHorses = clusters.oldmac.o_new_horse

	const
	rows = []
	for ( const [ , line ] of orh.scanByKey( OldmacRaceKey( jyo, year, kaiji, nichiji, racenum ) + '|' ) ) {
		const
		horse = ZipLegacy( orh, line )
	,	h = se.get( +horse.GATE_NO )
		if ( !h ) continue

		//	o_comment: CONTENT → COMMENT code (GetSenpyouCD)
		let
		SENPYO_CD = ''
		if ( horse.COMMENT ) for ( const [ , cline ] of comments.scan() ) {
			const
			c = ZipLegacy( comments, cline )
			if ( String( c.CONTENT ) === String( horse.COMMENT ) ) { SENPYO_CD = String( c.COMMENT ) ; break }
		}

		//	o_new_horse: HORSE → CONDITION/CONTENT2 (DrawComment)
		let
		NEW_CONDITION = '', NEW_CONTENT2 = ''
		if ( +horse.HORSE ) for ( const [ , nline ] of newHorses.scan() ) {
			const
			n = ZipLegacy( newHorses, nline )
			if ( +n.HORSE === +horse.HORSE ) { NEW_CONDITION = String( n.CONDITION ?? '' ) ; NEW_CONTENT2 = String( n.CONTENT2 ?? '' ) ; break }
		}

		rows.push( { ...ra, ...h, ...ora, ...horse, HTL3: h.HaronTimeL3, HTL4: h.HaronTimeL4, SENPYO_CD, NEW_CONDITION, NEW_CONTENT2 } )
	}

	rows.sort( ( a, b ) =>
		( ( +a.POSITION || +a.GATE_NO + 100 ) - ( +b.POSITION || +b.GATE_NO + 100 ) )
	||	( +a.GATE_NO - +b.GATE_NO )
	)
	return rows
}

///////////////////////////////	jv → oldmac race import (oJraRead_Click port)

//	着差コード → [ 馬身, 端数コード ]. Values are fully trimmed in our data, so the
//	original " 12"/" 14"/" 34" (leading space = pure fraction) arrive as "12"/"14"/"34" —
//	unambiguous, since 10+ lengths are coded Z/T.
const
MakeDiffCD = cd => {
	if ( cd === '' ) return [ 0, 0 ]
	if ( cd === '12' || cd === '14' || cd === '34' ) return [ 0, +cd ]
	const
	c0 = cd[ 0 ]
,	rest = cd.slice( 1 )
,	w1 = rest === '' ? 0 : parseInt( rest, 10 )
	if ( c0 >= '0' && c0 <= '9' ) return [ +c0, w1 ]
	switch ( c0 ) {
	case 'Z': return [ 10, w1 ]
	case 'H': return [ 0, 1 ]
	case 'A': return [ 0, 2 ]
	case 'K': return [ 0, 3 ]
	case 'D': return [ 0, 4 ]
	case 'T': return [ 0, 5 ]
	}
	return [ 0, 0 ]
}

const
DiffIndex = p => ( { 1: 1, 2: 2, 3: 4, 4: 0, 18: 3, 14: 5, 38: 6, 12: 7, 58: 8, 34: 9, 78: 10 }[ p ] ?? 11 )

const
DIFF_MAT = [
//	   D    H    A   18    K   14   38   12   58   34   78    0
	[  4,   1,   2,  18,   3,  14,  38,  12,  58,  34,  78,   0 ]
,	[  1,   1,   2,  18,   3,  14,  38,  12,  58,  34,  78,   1 ]
,	[  2,   2,   3,  14,  38,  38,  12,  58,  34,  78, 100,   2 ]
,	[ 18,  18,  14,  14,  38,  38,  12,  58,  34,  78, 100,  18 ]
,	[  3,   3,  38,  38,  12,  12,  58,  34,  78, 100, 118,   3 ]
,	[ 14,  14,  38,  38,  12,  12,  58,  34,  78, 100, 118,  14 ]
,	[ 38,  38,  12,  12,  58,  58,  34,  78, 100, 118, 114,  38 ]
,	[ 12,  12,  58,  58,  34,  34,  78, 100, 118, 114, 138,  12 ]
,	[ 58,  58,  34,  34,  78,  78, 100, 118, 114, 138, 112,  58 ]
,	[ 34,  34,  78,  78, 100, 100, 118, 114, 138, 112, 158,  34 ]
,	[ 78,  78, 100, 100, 118, 118, 114, 138, 112, 158, 134,  78 ]
,	[  0,   1,   2,  18,   3,  14,  38,  12,  58,  34,  78,   0 ]
]

const
AddDiff = ( l, r ) => {
	if ( l[ 1 ] === 5 ) return l
	if ( r[ 1 ] === 5 ) return r
	const
	w = DIFF_MAT[ DiffIndex( l[ 1 ] ) ][ DiffIndex( r[ 1 ] ) ]
	return [ l[ 0 ] + r[ 0 ] + Math.floor( w / 100 ), w % 100 ]
}

const
MakeDiff = h => AddDiff( AddDiff( MakeDiffCD( AsStr( h, 'ChakusaCD' ) ), MakeDiffCD( AsStr( h, 'ChakusaCDP' ) ) ), MakeDiffCD( AsStr( h, 'ChakusaCDPP' ) ) )

//	reserved3/reserved4 of the C# code → { d3, d4 } scratch per horse.
const
SetDiffStr = ( h, p ) => {
	h.d3 = p[ 0 ]
	switch ( p[ 1 ] ) {
	case  1:
	case  2:
	case  4:	h.d4 = p[ 0 ] === 0 ? p[ 1 ] : 0;	break
	case  3:	h.d4 = p[ 0 ] === 0 ? p[ 1 ] : 14;	break
	case 18:	h.d4 = 0;	break
	case 38:	h.d4 = 14;	break
	case 58:	h.d4 = 12;	break
	case 78:	h.d4 = 34;	break
	default:	h.d4 = p[ 1 ];	break
	}
}

const
ImportRace = ( clusters, { year, jyo, kaiji, nichiji } ) => {
	const
	log = []
,	oRace = clusters.oldmac.o_race
,	oRH = clusters.oldmac.o_race_horse
,	oHorse = clusters.oldmac.o_horse
,	chukoRace = clusters.chuko.race

	//	KettoJRA → HORSE id map (the LEFT JOIN o_horse ON KettoNum = KettoJRA)
	const
	hm = oHorse.meta()
,	iKetto = hm.fields.indexOf( 'KettoJRA' )
,	iHorse = hm.fields.indexOf( 'HORSE' )
,	horseByKetto = new Map()
	for ( const [ , line ] of oHorse.scan() ) {
		const
		record = JSON.parse( line )
		if ( record[ iKetto ] ) horseByKetto.set( String( record[ iKetto ] ), record[ iHorse ] )
	}

	for ( const ra of RacesOfDay( clusters, year, jyo, kaiji, nichiji ) ) {
		log.push( `${ +ra.id_RaceNum }レース` )

		//	chuko.race の Ryakusyo3 を SHORT_NAME に
		const
		chukoLine = chukoRace.getByKey( `${ +year }|${ +kaiji }|${ jyo }|${ +nichiji }|${ +ra.id_RaceNum }` )
	,	shortName = chukoLine ? String( ZipLegacy( chukoRace, chukoLine ).RaceInfo_Ryakusyo3 ?? '' ) : ''

	//	INSERT IGNORE INTO o_race
	const
	raceKey = OldmacRaceKey( jyo, year, kaiji, nichiji, ra.id_RaceNum )
		if ( !oRace.hasKey( raceKey ) ) oRace.post( [ +jyo, +year, +kaiji, +nichiji, +ra.id_RaceNum, shortName, 0, 0, 0, 0 ] )

		//	出走馬 1..TorokuTosu
		const
		se = SEOfRace( clusters, ra ).filter( h => h.head_DataKubun === '7' || h.head_DataKubun === '9' )
	,	byUmaban = new Map( se.map( h => [ +h.Umaban, h ] ) )
	,	tosu = AsInt( ra, 'TorokuTosu' )
	,	horses = []
		for ( let i = 1; i <= tosu; i++ ) {
			const
			h = byUmaban.get( i )
			if ( !h ) throw Object.assign( new Error( `JVに出走馬データがありません。馬番：${ i }` ), { status: 400 } )
			horses.push( h )
		}

		horses.sort( ( l, r ) => ( AsInt( l, 'KakuteiJyuni' ) - AsInt( r, 'KakuteiJyuni' ) ) || ( AsInt( l, 'Umaban' ) - AsInt( r, 'Umaban' ) ) )

		//	着差計算
		let
		winnerIndex = 0
		while ( winnerIndex < horses.length && AsInt( horses[ winnerIndex ], 'KakuteiJyuni' ) !== 1 ) winnerIndex++
		let
		index = winnerIndex
		if ( index < horses.length ) {
			const
			time0 = AsInt( horses[ index ], 'Time' )
		,	winnerTime = Math.floor( time0 / 1000 ) * 600 + time0 % 1000
			let
			prevTime = winnerTime
		,	prevDiff = MakeDiff( horses[ index ] )
			SetDiffStr( horses[ index ], prevDiff )

			for ( let i = index + 1; i < horses.length; i++ ) {
				if ( AsInt( horses[ i ], 'KakuteiJyuni' ) > AsInt( horses[ i ], 'NyusenJyuni' ) ) {
					SetDiffStr( horses[ i ], prevDiff )
					continue
				}
				const
				t = AsInt( horses[ i ], 'Time' )
			,	time = Math.floor( t / 1000 ) * 600 + t % 1000
				if ( time - winnerTime >= 31 ) {
					SetDiffStr( horses[ i ], [ 0, 5 ] )
				} else {
					let
					diff = MakeDiff( horses[ i ] )
					if ( diff[ 1 ] === 5 ) {
						let w = 0
						switch ( TD( ra ) ) {
						case '芝':	w = ( time - prevTime ) * 6;	break
						case 'ダ':	w = ( time - prevTime ) * 5;	break
						}
						diff[ 0 ] = Math.floor( w / 10 )
						switch ( w % 10 ) {
						case 0: case 1: case 2:			diff[ 1 ] = 0;	break
						case 3: case 4:					diff[ 1 ] = 14;	break
						case 5: case 6: case 7:			diff[ 1 ] = 12;	break
						case 8: case 9:					diff[ 1 ] = 34;	break
						}
					}
					diff = AddDiff( diff, prevDiff )
					SetDiffStr( horses[ i ], diff )
					prevDiff = diff
				}
				prevTime = time
			}
			if ( winnerIndex + 1 < horses.length ) {
				horses[ winnerIndex ].d3 = horses[ winnerIndex + 1 ].d3
				horses[ winnerIndex ].d4 = horses[ winnerIndex + 1 ].d4
				while ( winnerIndex < horses.length && +horses[ winnerIndex ].d3 === 0 && +horses[ winnerIndex ].d4 === 0 ) {
					horses[ winnerIndex++ ].d4 = 4
				}
			}
		}

		//	INSERT IGNORE INTO o_race_horse
	for ( const h of horses ) {
		const
		key = `${ raceKey }|${ +h.Umaban }`
		if ( oRH.hasKey( key ) ) continue
		oRH.post( [
				+jyo, +year, +kaiji, +nichiji, +ra.id_RaceNum
			,	AsInt( h, 'Umaban' )
			,	+( horseByKetto.get( h.KettoNum ) ?? 0 )
			,	0											//	STATUS
			,	AsInt( h, 'KakuteiJyuni' )					//	POSITION
			,	AsInt( h, 'NyusenJyuni' )					//	POSITION2
			,	AsInt( h, 'IJyoCD' )						//	REASON
			,	0											//	START3F
			,	PH( ra ) === 1 ? AsInt( h, 'HaronTimeL3' ) : 0	//	LAST3F
			,	0, 0, 0, 0, 0								//	KIMARITE, MS_JUNI, MS_FURI, C1_JUNI, C1_FURI
			,	AsInt( h, 'Jyuni1c' ), 0					//	C2_JUNI, C2_FURI
			,	AsInt( h, 'Jyuni2c' ), 0					//	BS_JUNI, BS_FURI
			,	AsInt( h, 'Jyuni3c' ), 0					//	C3_JUNI, C3_FURI
			,	AsInt( h, 'Jyuni4c' ), 0					//	C4_JUNI, C4_FURI
			,	2											//	C4_ICHIDORI
			,	h.d3 ?? 0, h.d4 ?? 0						//	DIFF0, DIFF1
			,	0, 0										//	DIFF2, DIFF3
			,	'', '', ''									//	COMMENT, FUKA1, FUKA2
			] )
		}
	}
	log.push( 'レース取得終了' )
	return log
}

///////////////////////////////	馬名検索 (oBameiKD port) — um.bamei secondary index

const
SearchBamei = ( clusters, text, type ) => {
	const
	um = clusters.jv.jv_um_uma
,	se = clusters.jv.jv_se_race_uma
,	bamei = um.secondary?.bamei
	if ( !bamei ) throw Object.assign( new Error( 'bamei index not built' ), { status: 500 } )

	const
	Match = type === '前方一致'	? n => n.startsWith( text )
	:	type === '後方一致'		? n => n.endsWith( text )
	:	type === '含む'			? n => n.includes( text )
	:	n => n === text

	const
	results = []
	for ( const [ name, kettos ] of bamei ) {
		if ( !Match( name ) ) continue
		for ( const ketto of kettos ) for ( const key of se.lookup( 'ketto', ketto ) ) {
			const
			h = JSON.parse( se.get( key ) )
			if ( [ '7', 'A', 'B' ].includes( h.head_DataKubun ) ) results.push( {
				id_Year: h.id_Year, id_MonthDay: h.id_MonthDay, id_Kaiji: h.id_Kaiji
			,	id_JyoCD: h.id_JyoCD, id_Nichiji: h.id_Nichiji, id_RaceNum: h.id_RaceNum
			,	Bamei: h.Bamei
			} )
		}
		if ( results.length > 500 ) break
	}
	return results.sort( ( a, b ) => ( +b.id_Year - +a.id_Year ) || ( +b.id_MonthDay - +a.id_MonthDay ) )
}

///////////////////////////////	UmaEditor

const
MatchText = ( text, type ) => {
	const
	needle = String( text ?? '' )
	return type === '前方一致'	? value => value.startsWith( needle )
	:	type === '後方一致'		? value => value.endsWith( needle )
	:	type === '含む'			? value => value.includes( needle )
	:	value => value === needle
}

const
SearchUma = ( clusters, text, type, limit = 100 ) => {
	const
	horses = clusters.oldmac.o_horse
,	match = MatchText( text, type )
,	rows = []
	for ( const [ id, line ] of horses.scan() ) {
		const
		object = ZipLegacy( horses, line )
		if ( match( String( object.NAME ?? '' ) ) ) rows.push( { id, object } )
	}
	return rows
		.sort( ( a, b ) => ( +b.object.BIRTHDAY - +a.object.BIRTHDAY ) || ( +b.object.HORSE - +a.object.HORSE ) )
		.slice( 0, limit )
}

const
JVByNewestKey = ( cluster, key ) => {
	let
	best = null
	const
	keyField = cluster.meta().keyFields?.[ 0 ]
	for ( const [ , line ] of cluster.scanByKey( String( key ) ) ) {
		const
		row = JSON.parse( line )
		if ( keyField && String( row[ keyField ] ) !== String( key ) ) continue
		if ( best === null || String( row.head_MakeDate ?? '' ) > String( best.head_MakeDate ?? '' ) ) best = row
	}
	return best
}

const
HorseByHansyoku = ( clusters, hansyoku ) => {
	if ( !+hansyoku ) return null
	return HorsesByHansyoku( clusters, [ hansyoku ] ).get( String( hansyoku ) ) ?? null
}

const
HorsesByHansyoku = ( clusters, hansyokus ) => {
	const
	targets = new Set( hansyokus.filter( _ => +_ ).map( _ => String( _ ) ) )
,	found = new Map()
	if ( targets.size === 0 ) return found
	const
	horses = clusters.oldmac.o_horse
	for ( const [ id, line ] of horses.scan() ) {
		const
		object = ZipLegacy( horses, line )
	,	key = String( object.HansyokuJRA ?? '' )
		if ( targets.has( key ) ) {
			found.set( key, { id, object } )
			if ( found.size === targets.size ) break
		}
	}
	return found
}

const
UmaFamily = ( clusters, horse ) => {
	const
	LabelHorse = row => row?.object?.NAME ?? ''
,	byId = id => LegacyByKey( clusters.oldmac.o_horse, String( Number( id ) ) )
,	result = {
		horse: horse.NAME ?? '', father: '', mother: '', ff: '', fm: '', mf: '', mm: ''
	,	detail: String( horse.BIRTHDAY ?? '' ), kigou: '', prize: '', trainer: '', farm: '', owner: ''
	,	tekisei: `距離：${ horse.TEKISEI ?? '' } 重：${ horse.OMO_TEKISEI ?? '' } ダ重：${ horse.DIRT_OMO_TEKISEI ?? '' }`
	,	parentIds: {}
	}

	const
	um = +horse.KettoJRA ? JVByNewestKey( clusters.jv.jv_um_uma, horse.KettoJRA ) : null
	if ( um ) {
		const
		byHansyoku = HorsesByHansyoku( clusters, [
			um.Ketto3Info_0_HansyokuNum, um.Ketto3Info_1_HansyokuNum, um.Ketto3Info_2_HansyokuNum
		,	um.Ketto3Info_3_HansyokuNum, um.Ketto3Info_4_HansyokuNum, um.Ketto3Info_5_HansyokuNum
		] )
	,	father = byHansyoku.get( String( um.Ketto3Info_0_HansyokuNum ) )
	,	mother = byHansyoku.get( String( um.Ketto3Info_1_HansyokuNum ) )
	,	ff = byHansyoku.get( String( um.Ketto3Info_2_HansyokuNum ) )
	,	mf = byHansyoku.get( String( um.Ketto3Info_3_HansyokuNum ) )
	,	fm = byHansyoku.get( String( um.Ketto3Info_4_HansyokuNum ) )
	,	mm = byHansyoku.get( String( um.Ketto3Info_5_HansyokuNum ) )
		result.father = LabelHorse( father ) || `(${ um.Ketto3Info_0_Bamei ?? '' })`
		result.mother = LabelHorse( mother ) || `(${ um.Ketto3Info_1_Bamei ?? '' })`
		result.ff = LabelHorse( ff ) || `(${ um.Ketto3Info_2_Bamei ?? '' })`
		result.mf = LabelHorse( mf ) || `(${ um.Ketto3Info_3_Bamei ?? '' })`
		result.fm = LabelHorse( fm ) || `(${ um.Ketto3Info_4_Bamei ?? '' })`
		result.mm = LabelHorse( mm ) || `(${ um.Ketto3Info_5_Bamei ?? '' })`
		if ( father ) result.parentIds.father = father.object.HORSE
		if ( mother ) result.parentIds.mother = mother.object.HORSE
		result.prize = `本賞：${ +um.RuikeiHonsyoHeiti || 0 } 障：${ +um.RuikeiHonsyoSyogai || 0 } 総賞：${ +um.RuikeiSyutokuHeichi || 0 } 障：${ +um.RuikeiSyutokuSyogai || 0 }`
		result.detail = [ horse.BIRTHDAY, { 1: '牡', 2: '牝', 3: '騙' }[ um.SexCD ] ?? '', { '01': '栗毛', '02': '栃栗', '03': '鹿毛', '04': '黒鹿', '05': '青鹿', '06': '青毛', '07': '芦毛', '08': '栗粕', '09': '鹿粕', '10': '青粕', '11': '白毛' }[ um.KeiroCD ] ?? '' ].filter( Boolean ).join( ' ' )
		result.kigou = { '06': '○外', '16': '○外', '20': '○外', '05': '○地', '09': '○地', '10': '○地', '12': '○地', '26': '□外', '27': '□外', '21': '□地', '23': '□地', '24': '□地', '25': '□地', '11': '○外地', '40': '○外地', '22': '□外地', '41': '□外地' }[ um.UmaKigoCD ] ?? ''
		result.trainer = JVByNewestKey( clusters.jv.jv_ch_chokyosi, um.ChokyosiCode )?.ChokyosiName ?? ''
		result.farm = JVByNewestKey( clusters.jv.jv_br_breeder, um.BreederCode )?.BreederName ?? ''
		result.owner = JVByNewestKey( clusters.jv.jv_bn_banusi, um.BanusiCode )?.BanusiName ?? ''
		return result
	}

	const
	father = byId( horse.FATHER )
,	mother = byId( horse.MOTHER )
,	ff = father ? byId( father.object.FATHER ) : null
,	mf = father ? byId( father.object.MOTHER ) : null
,	fm = mother ? byId( mother.object.FATHER ) : null
,	mm = mother ? byId( mother.object.MOTHER ) : null
	result.father = LabelHorse( father ) || '(不明)'
	result.mother = LabelHorse( mother ) || '(不明)'
	result.ff = LabelHorse( ff ) || '(不明)'
	result.mf = LabelHorse( mf ) || '(不明)'
	result.fm = LabelHorse( fm ) || '(不明)'
	result.mm = LabelHorse( mm ) || '(不明)'
	return result
}

const
UmaDetail = ( clusters, horseKey ) => {
	const
	horse = LegacyByKey( clusters.oldmac.o_horse, String( Number( horseKey ) ) )
	if ( !horse ) return null

	const
	key = String( Number( horse.object.HORSE ) )
,	motherHansyoku = +horse.object.KettoJRA ? JVByNewestKey( clusters.jv.jv_um_uma, horse.object.KettoJRA )?.Ketto3Info_1_HansyokuNum : 0
,	mother = motherHansyoku ? HorseByHansyoku( clusters, motherHansyoku ) : LegacyByKey( clusters.oldmac.o_horse, String( Number( horse.object.MOTHER ) ) )
	return {
		horse
	,	family: UmaFamily( clusters, horse.object )
	,	mother
	,	relatives: LegacyScanByKey( clusters.oldmac.o_horse_relative, `${ key }|` ).sort( ( a, b ) => ( +a.object.KUBUN - +b.object.KUBUN ) || ( +a.object.PRIORITY - +b.object.PRIORITY ) )
	,	noJra: LegacyScanByKey( clusters.oldmac.o_no_jra, `${ key }|` ).sort( ( a, b ) => +b.object.DATE - +a.object.DATE )
	,	bestTimes: LegacyScanByKey( clusters.oldmac.o_best_time, `${ key }|` ).sort( ( a, b ) => ( +a.object.DISTANCE - +b.object.DISTANCE ) || String( a.object.TYPE ).localeCompare( String( b.object.TYPE ) ) )
	,	rests: LegacyScanByKey( clusters.oldmac.o_rest, `${ key }|` ).sort( ( a, b ) => +b.object.DATE - +a.object.DATE )
	,	bloods: LegacyScanByKey( clusters.oldmac.o_blood, `${ key }|` )
	,	newHorse: LegacyByKey( clusters.oldmac.o_new_horse, key )
	,	syogai: LegacyByKey( clusters.oldmac.o_syogai, key )
	}
}

const
UmaLookups = clusters => ( {
	courses: LegacyScanByKey( clusters.oldmac.o_course, '' ).map( _ => _.object )
,	comments: LegacyScanByKey( clusters.oldmac.o_comment, '' ).map( _ => _.object )
} )

const
UmaNextHorse = clusters => {
	let
	max = 0
	for ( const [ , line ] of clusters.oldmac.o_horse.scan() ) {
		const
		record = JSON.parse( line )
		max = Math.max( max, Number( record[ 0 ] ) || 0 )
	}
	return max + 1
}

export const
APIRoutes = clusters => ( {
	'/api/race-day': async ( Q, S ) => {
		const
		q = QueryOf( Q )
		SendJSONable( S, RacesOfDay( clusters, q.get( 'year' ), q.get( 'jyo' ), q.get( 'kaiji' ), q.get( 'nichiji' ) ) )
	}
,	'/api/result-data': async ( Q, S ) => {
		const
		q = QueryOf( Q )
	,	rows = ResultData( clusters, {
			year: q.get( 'year' ), jyo: q.get( 'jyo' ), kaiji: q.get( 'kaiji' )
		,	nichiji: q.get( 'nichiji' ), racenum: q.get( 'racenum' )
		} )
		rows === null || !rows.length ? _404( S, 'No result data.' ) : SendJSONable( S, rows )
	}
,	'/api/import-race': async ( Q, S ) => {
		if ( Q.method !== 'POST' ) return _405( S )
		try {
			SendJSONable( S, ImportRace( clusters, await BodyAsJSON( Q ) ) )
		} catch ( e ) {
			if ( !e.status ) throw e
			Send( S, e.status, e.message )
		}
	}
,	'/api/search-bamei': async ( Q, S ) => {
		const
		q = QueryOf( Q )
		try {
			SendJSONable( S, SearchBamei( clusters, q.get( 'text' ) ?? '', q.get( 'type' ) ?? '一致' ) )
		} catch ( e ) {
			if ( !e.status ) throw e
			Send( S, e.status, e.message )
		}
	}
,	'/api/uma-search': async ( Q, S ) => {
		const
		q = QueryOf( Q )
		SendJSONable( S, SearchUma( clusters, q.get( 'text' ) ?? '', q.get( 'type' ) ?? '前方一致', Number( q.get( 'limit' ) ?? 100 ) ) )
	}
,	'/api/uma-detail': async ( Q, S ) => {
		const
		q = QueryOf( Q )
	,	detail = UmaDetail( clusters, q.get( 'horse' ) )
		detail === null ? _404( S, 'No horse data.' ) : SendJSONable( S, detail )
	}
,	'/api/uma-lookups': async ( Q, S ) => {
		SendJSONable( S, UmaLookups( clusters ) )
	}
,	'/api/uma-next-horse': async ( Q, S ) => {
		SendJSONable( S, UmaNextHorse( clusters ) )
	}
,
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
