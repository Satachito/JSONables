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

import { TD, TDH, PH, AsInt, AsStr, Course, JyoCD2StrJPN, BabaT, BabaD, KeiroCDString, JyokenInfo_SyubetuCD_Hondai, JyokenInfo_JyokenCD_4 } from '../data/deumacodes.js'

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

///////////////////////////////	検索ポータル

//	One year of a track's meeting days, from RA keys (year|monthday|jyo|kaiji|nichiji|racenum)
//	— distinct (monthday, kaiji, nichiji) with race counts, newest first.
const
Calendar = ( clusters, year, jyo ) => {
	const
	days = new Map()
	for ( const [ key ] of clusters.jv.jv_ra_race.scan( `${ year }|` ) ) {
		const
		[ , monthday, jyoCD, kaiji, nichiji ] = key.split( '|' )
		if ( jyoCD !== jyo ) continue
		const
		k = `${ monthday }|${ kaiji }|${ nichiji }`
		;( days.get( k ) ?? days.set( k, { monthday, kaiji, nichiji, count: 0 } ).get( k ) ).count++
	}
	return [ ...days.values() ].sort( ( a, b ) => b.monthday.localeCompare( a.monthday ) )
}

//	その年の中央全レースを 場→開催日→レース の入れ子で返す（details/summary ツリー用）。
const
YearRaces = ( clusters, year ) => {
	const
	Central = jyo => Number( jyo ) >= 1 && Number( jyo ) <= 10
	,	venues = new Map()	//	jyo → Map( `${kaiji}|${nichiji}|${monthday}` → { monthday, kaiji, nichiji, races[] } )
	for ( const [ key, line ] of clusters.jv.jv_ra_race.scan( `${ year }|` ) ) {
		const
		[ , monthday, jyo, kaiji, nichiji, racenum ] = key.split( '|' )
		if ( !Central( jyo ) ) continue
		const
		r = JSON.parse( line )
		,	v = venues.get( jyo ) ?? venues.set( jyo, new Map() ).get( jyo )
		,	dk = `${ kaiji }|${ nichiji }|${ monthday }`
		,	day = v.get( dk ) ?? v.set( dk, { monthday, kaiji, nichiji, races: [] } ).get( dk )
		day.races.push( { racenum, title: RaceName( r ), grade: String( r.GradeCD ?? '' ), td: TDH( r ), distance: AsInt( r, 'Kyori' ) } )
	}
	const
	out = []
	for ( const [ jyo, days ] of [ ...venues.entries() ].sort( ( a, b ) => a[ 0 ].localeCompare( b[ 0 ] ) ) ) {
		const
		dayList = [ ...days.values() ].sort( ( a, b ) => b.monthday.localeCompare( a.monthday ) )
		for ( const d of dayList ) d.races.sort( ( a, b ) => Number( a.racenum ) - Number( b.racenum ) )
		out.push( { jyo, jyoName: JyoCD2StrJPN( jyo ) || jyo, days: dayList } )
	}
	return { year: String( year ), venues: out }
}

//	One season's leaderboard, aggregated from confirmed SE runners (head_DataKubun 7)
//	of the given year. kind picks the grouping key + display name + sort metric:
//		jockey/trainer → 勝利数順（リーディング）, owner/horse → 本賞金順.
const
RANKING_SPEC = {
	jockey	: { code: 'KisyuCode',		name: 'KisyuRyakusyo',	metric: 'wins'  }
,	trainer	: { code: 'ChokyosiCode',	name: 'ChokyosiRyakusyo',	metric: 'wins'  }
,	owner	: { code: 'BanusiCode',		name: 'BanusiName',		metric: 'prize' }
,	horse	: { code: 'KettoNum',		name: 'Bamei',			metric: 'prize' }
}

//	from/to は YYYYMMDD（to は省略可＝現在まで）。SEキー(YYYY|MMDD|…)は日付昇順に
//	並ぶので、開始年〜終了年を年プレフィックスで走査し、各行の日付を範囲で絞る。
const
Ranking = ( clusters, from, to, kind ) => {
	const
	spec = RANKING_SPEC[ kind ]
	if ( !spec ) throw Object.assign( new Error( `Unknown ranking kind: ${ kind }` ), { status: 400 } )
	if ( !/^\d{8}$/.test( String( from ) ) ) throw Object.assign( new Error( 'from must be YYYYMMDD' ), { status: 400 } )
	if ( to && !/^\d{8}$/.test( String( to ) ) ) throw Object.assign( new Error( 'to must be YYYYMMDD' ), { status: 400 } )

	const
	fromNum		= Number( from )
	,	toNum		= to ? Number( to ) : Infinity
	,	startYear	= Number( from.slice( 0, 4 ) )
	,	endYear		= to ? Number( to.slice( 0, 4 ) ) : new Date().getFullYear()

	const
	map = new Map()	//	code → { code, name, rides, w1, w2, w3, prize }
	for ( let year = startYear; year <= endYear; year++ ) {
		for ( const [ , line ] of clusters.jv.jv_se_race_uma.scan( `${ year }|` ) ) {
			const
			r = JSON.parse( line )
			if ( r.head_DataKubun !== '7' ) continue
			const
			dateNum = Number( `${ r.id_Year }${ r.id_MonthDay }` )
			if ( dateNum < fromNum || dateNum > toNum ) continue
			const
			code = String( r[ spec.code ] ?? '' ).trim()
			if ( !code ) continue
			const
			entry = map.get( code ) ?? map.set( code, { code, name: '', rides: 0, w1: 0, w2: 0, w3: 0, prize: 0 } ).get( code )
			const
			name = String( r[ spec.name ] ?? '' ).trim()
			if ( name ) entry.name = name
			entry.rides++
			const
			jyuni = Number( r.KakuteiJyuni )
			if ( jyuni === 1 ) entry.w1++
			else if ( jyuni === 2 ) entry.w2++
			else if ( jyuni === 3 ) entry.w3++
			entry.prize += Number( r.Honsyokin ) || 0	//	百円単位
		}
	}

	const
	rows = [ ...map.values() ].sort( spec.metric === 'prize'
		?	( a, b ) => ( b.prize - a.prize ) || ( b.w1 - a.w1 )
		:	( a, b ) => ( b.w1 - a.w1 ) || ( b.w2 - a.w2 ) || ( b.w3 - a.w3 ) || ( b.prize - a.prize )
	)
	return rows.slice( 0, 100 ).map( ( e, i ) => ( { rank: i + 1, ...e } ) )
}

///////////////////////////////	詳細（基本情報＋競走成績）

const
RESULT_SPEC = {
	jockey	: { codeField: 'KisyuCode',		master: 'jv_ks_kisyu'		}
,	trainer	: { codeField: 'ChokyosiCode',	master: 'jv_ch_chokyosi'	}
,	owner	: { codeField: 'BanusiCode',		master: 'jv_bn_banusi'		}
,	horse	: { codeField: 'KettoNum',		master: 'jv_um_uma'		}
}

const
MAX_RESULT_ROWS = 300

//	レース名: 本題→略称→条件名→（条件戦は 種別＋クラスを合成）
const
RaceName = race => {
	const
	hondai = String( race.RaceInfo_Hondai ?? '' ).trim()
	if ( hondai ) return hondai
	const
	ryaku = String( race.RaceInfo_Ryakusyo6 ?? '' ).trim()
	if ( ryaku ) return ryaku
	const
	jyoken = String( race.JyokenName ?? '' ).trim()
	if ( jyoken ) return jyoken
	return [
		JyokenInfo_SyubetuCD_Hondai( AsInt( race, 'JyokenInfo_SyubetuCD' ) )
	,	JyokenInfo_JyokenCD_4( AsInt( race, 'JyokenInfo_JyokenCD_4' ) )
	].filter( Boolean ).join( ' ' ).trim()
}

//	1レースの最新RAレコード（フルキー一致）
const
RaceByKey = ( clusters, key ) => {
	let
	best = null
	for ( const [ , line ] of clusters.jv.jv_ra_race.scan( key ) ) {
		const
		r = JSON.parse( line )
		if ( [ r.id_Year, r.id_MonthDay, r.id_JyoCD, r.id_Kaiji, r.id_Nichiji, r.id_RaceNum ].join( '|' ) !== key ) continue
		if ( best === null || String( r.head_MakeDate ?? '' ) > String( best.head_MakeDate ?? '' ) ) best = r
	}
	return best
}

//	SE行(出走馬) を RA(レース) で肉付けした競走成績1行
const
EnrichRace = ( clusters, h, cache ) => {
	const
	key = [ h.id_Year, h.id_MonthDay, h.id_JyoCD, h.id_Kaiji, h.id_Nichiji, h.id_RaceNum ].join( '|' )
	let
	race = cache.get( key )
	if ( race === undefined ) { race = RaceByKey( clusters, key ) ; cache.set( key, race ) }
	const
	td = race ? TDH( race ) : ''
	return {
		year: h.id_Year, monthday: h.id_MonthDay
	,	jyo: h.id_JyoCD, jyoName: JyoCD2StrJPN( h.id_JyoCD ) || h.id_JyoCD
	,	kaiji: h.id_Kaiji, nichiji: h.id_Nichiji, racenum: h.id_RaceNum
	,	raceTitle: race ? RaceName( race ) : ''
	,	grade: race ? String( race.GradeCD ?? '' ) : ''
	,	td, distance: race ? AsInt( race, 'Kyori' ) : 0
	,	baba: race ? ( td === 'ダ' ? BabaD( race ) : BabaT( race ) ) : ''
	,	fieldSize: race ? AsInt( race, 'SyussoTosu' ) : 0
	,	wakuban: h.Wakuban, umaban: h.Umaban, ninki: h.Ninki
	,	chaku: h.KakuteiJyuni, ijyo: h.IJyoCD
	,	bamei: String( h.Bamei ?? '' ).trim(), jockey: String( h.KisyuRyakusyo ?? '' ).trim()
	,	sexBarei: `${ h.SexCD }${ h.Barei }`, futan: h.Futan
	,	time: h.Time, last3f: h.HaronTimeL3
	,	baTaijyu: h.BaTaijyu, zogenFugo: h.ZogenFugo, zogenSa: h.ZogenSa
	}
}

//	対象(騎手/調教師/馬主/馬)の SE行を集める。馬は ketto 索引で全成績、
//	人は期間内を再走査。新しい順、上限あり。
const
EntitySE = ( clusters, kind, code, from, to ) => {
	const
	se = clusters.jv.jv_se_race_uma
	,	spec = RESULT_SPEC[ kind ]
	,	rows = []
	if ( kind === 'horse' ) {
		for ( const key of se.lookup( 'ketto', String( code ) ) ) {
			const
			h = JSON.parse( se.get( key ) )
			if ( [ '7', 'A', 'B' ].includes( h.head_DataKubun ) ) rows.push( h )
		}
	} else {
		const
		fromNum		= Number( from )
		,	toNum		= to ? Number( to ) : Infinity
		,	startYear	= Number( from.slice( 0, 4 ) )
		,	endYear		= to ? Number( to.slice( 0, 4 ) ) : new Date().getFullYear()
		for ( let year = startYear; year <= endYear; year++ ) {
			for ( const [ , line ] of se.scan( `${ year }|` ) ) {
				const
				h = JSON.parse( line )
				if ( h.head_DataKubun !== '7' ) continue
				const
				dateNum = Number( `${ h.id_Year }${ h.id_MonthDay }` )
				if ( dateNum < fromNum || dateNum > toNum ) continue
				if ( String( h[ spec.codeField ] ?? '' ).trim() !== String( code ) ) continue
				rows.push( h )
			}
		}
	}
	rows.sort( ( a, b ) => Number( `${ b.id_Year }${ b.id_MonthDay }` ) - Number( `${ a.id_Year }${ a.id_MonthDay }` ) )
	return rows
}

const
SexCDStr = cd => ( { '1': '牡', '2': '牝', '3': 'セ' }[ cd ] ?? '' )

const
TozaiStr = cd => ( { '1': '美浦', '2': '栗東', '3': '地方', '4': '海外' }[ cd ] ?? '' )

const
YmdStr = ( y, m, d ) => y ? `${ y }/${ m }/${ d }` : ''

//	集計成績（[1-2-3-着外]・勝率・本賞金）
const
Summary = rows => {
	const
	s = { rides: rows.length, w1: 0, w2: 0, w3: 0, prize: 0 }
	for ( const h of rows ) {
		const
		j = Number( h.KakuteiJyuni )
		if ( j === 1 ) s.w1++
		else if ( j === 2 ) s.w2++
		else if ( j === 3 ) s.w3++
		s.prize += Number( h.Honsyokin ) || 0
	}
	return s
}

//	kind別 基本情報（マスタ＋集計）を表示用の pairs にまとめる
const
BuildInfo = ( clusters, kind, code, master, summary ) => {
	const
	m = master ?? {}
	if ( kind === 'horse' ) return {
		title		: String( m.Bamei ?? '' ).trim()
	,	subtitle	: [ SexCDStr( m.SexCD ), KeiroCDString( m.KeiroCD ) ].filter( Boolean ).join( '・' )
	,	pairs		: [
			[ '生年月日', YmdStr( m.BirthDate_Year, m.BirthDate_Month, m.BirthDate_Day ) ]
		,	[ '父', String( m.Ketto3Info_0_Bamei ?? '' ).trim() ]
		,	[ '母（母父）', `${ String( m.Ketto3Info_1_Bamei ?? '' ).trim() }（${ String( m.Ketto3Info_4_Bamei ?? '' ).trim() }）` ]
		,	[ '調教師', String( m.ChokyosiRyakusyo ?? '' ).trim() ]
		,	[ '馬主', String( m.BanusiName ?? '' ).trim() ]
		,	[ '生産者', String( m.BreederName ?? '' ).trim() ]
		,	[ '産地', String( m.SanchiName ?? '' ).trim() ]
		]
	}
	if ( kind === 'jockey' ) return {
		title		: String( m.KisyuName ?? '' ).trim()
	,	subtitle	: TozaiStr( m.TozaiCD )
	,	pairs		: [
			[ 'カナ', String( m.KisyuNameKana ?? '' ).trim() ]
		,	[ '生年月日', YmdStr( m.BirthDate_Year, m.BirthDate_Month, m.BirthDate_Day ) ]
		,	[ '所属', TozaiStr( m.TozaiCD ) ]
		,	[ '所属厩舎', String( m.ChokyosiRyakusyo ?? '' ).trim() ]
		]
	}
	if ( kind === 'trainer' ) return {
		title		: String( m.ChokyosiName ?? '' ).trim()
	,	subtitle	: TozaiStr( m.TozaiCD )
	,	pairs		: [
			[ 'カナ', String( m.ChokyosiNameKana ?? '' ).trim() ]
		,	[ '生年月日', YmdStr( m.BirthDate_Year, m.BirthDate_Month, m.BirthDate_Day ) ]
		,	[ '所属', TozaiStr( m.TozaiCD ) ]
		]
	}
	return {	//	owner
		title		: String( m.BanusiName ?? '' ).trim()
	,	subtitle	: ''
	,	pairs		: [
			[ 'カナ', String( m.BanusiNameKana ?? '' ).trim() ]
		,	[ '法人格付き', String( m.BanusiName_Co ?? '' ).trim() ]
		]
	}
}

//	oldmac o_horse を一度だけ走査して索引化（KettoJRA→馬 / HORSE→馬 / MOTHER→[馬]）。
//	o_horse はメモリ常駐なので初回のみ構築しキャッシュ。
let
_oldmacHorseIndex = null

const
OldmacHorseIndex = clusters => {
	if ( _oldmacHorseIndex ) return _oldmacHorseIndex
	const
	oh = clusters.oldmac.o_horse
	,	f = oh.meta().fields
	,	iHORSE = f.indexOf( 'HORSE' ), iNAME = f.indexOf( 'NAME' ), iBIRTH = f.indexOf( 'BIRTHDAY' )
	,	iFATHER = f.indexOf( 'FATHER' ), iMOTHER = f.indexOf( 'MOTHER' ), iSEX = f.indexOf( 'SEX' ), iKetto = f.indexOf( 'KettoJRA' )
	,	byId = new Map(), byKetto = new Map(), byMother = new Map()
	for ( const [ , line ] of oh.scan() ) {
		const
		r = JSON.parse( line )
		,	o = { HORSE: r[ iHORSE ], NAME: r[ iNAME ], BIRTHDAY: r[ iBIRTH ], FATHER: r[ iFATHER ], MOTHER: r[ iMOTHER ], SEX: r[ iSEX ], KettoJRA: r[ iKetto ] }
		byId.set( String( o.HORSE ), o )
		if ( o.KettoJRA ) byKetto.set( String( o.KettoJRA ), o )
		if ( +o.MOTHER ) ( byMother.get( String( o.MOTHER ) ) ?? byMother.set( String( o.MOTHER ), [] ).get( String( o.MOTHER ) ) ).push( o )
	}
	return _oldmacHorseIndex = { byId, byKetto, byMother }
}

const
SexShort = cd => ( { '1': '牡', '2': '牝', '3': 'セ' }[ String( cd ) ] ?? '' )

//	3代血統(14頭, jv) ＋ 全兄弟(母同じ, oldmac) ＋ 近親(curated o_horse_relative)
const
HorseFamily = ( clusters, ketto, um ) => {
	const
	pedigree = Array.from( { length: 14 }, ( _, i ) => String( um?.[ `Ketto3Info_${ i }_Bamei` ] ?? '' ).trim() )
	,	idx = OldmacHorseIndex( clusters )
	,	self = idx.byKetto.get( String( ketto ) )

	//	um マスタ未収録の新しい馬は、父母だけ oldmac から補完
	if ( !pedigree[ 0 ] && self ) {
		pedigree[ 0 ] = String( idx.byId.get( String( self.FATHER ) )?.NAME ?? '' ).trim()
		pedigree[ 1 ] = String( idx.byId.get( String( self.MOTHER ) )?.NAME ?? '' ).trim()
	}

	const
	siblings = self && +self.MOTHER
		? ( idx.byMother.get( String( self.MOTHER ) ) ?? [] )
			.filter( h => String( h.HORSE ) !== String( self.HORSE ) )
			.sort( ( a, b ) => Number( a.BIRTHDAY ) - Number( b.BIRTHDAY ) )
			.map( h => ( {
				name: h.NAME, birth: String( h.BIRTHDAY ).slice( 0, 4 ), sex: SexShort( h.SEX )
			,	sire: idx.byId.get( String( h.FATHER ) )?.NAME ?? ''
			,	ketto: h.KettoJRA ? String( h.KettoJRA ) : ''
			} ) )
		: []

	const
	relatives = self
		? LegacyScanByKey( clusters.oldmac.o_horse_relative, `${ self.HORSE }|` )
			.map( _ => _.object )
			.sort( ( a, b ) => ( +a.KUBUN - +b.KUBUN ) || ( +a.PRIORITY - +b.PRIORITY ) )
			.map( r => {
				const
				h = idx.byId.get( String( +r.RELATIVE ) )
				return { name: h?.NAME ?? '', kubun: +r.KUBUN, comment: String( r.COMMENT ?? '' ).trim(), ketto: h?.KettoJRA ? String( h.KettoJRA ) : '' }
			} )
			.filter( r => r.name )
		: []

	return { pedigree, siblings, relatives }
}

const
EntityResults = ( clusters, kind, code, from, to ) => {
	const
	spec = RESULT_SPEC[ kind ]
	if ( !spec ) throw Object.assign( new Error( `Unknown kind: ${ kind }` ), { status: 400 } )
	if ( !code ) throw Object.assign( new Error( 'code is required' ), { status: 400 } )

	const
	all = EntitySE( clusters, kind, code, from, to )
	,	summary = Summary( all )
	,	cache = new Map()
	,	races = all.slice( 0, MAX_RESULT_ROWS ).map( h => EnrichRace( clusters, h, cache ) )

	const
	masterLine = clusters.jv[ spec.master ].getByKey( String( code ) )
	,	master = masterLine ? JSON.parse( masterLine ) : null
	,	info = BuildInfo( clusters, kind, code, master, summary )

	//	馬: um マスタ未収録(未出走の新しい馬等)なら名前を oldmac から補完
	if ( kind === 'horse' && !info.title ) {
		const
		oh = OldmacHorseIndex( clusters ).byKetto.get( String( code ) )
		if ( oh ) info.title = String( oh.NAME ?? '' ).trim()
	}

	return {
		kind, code
	,	info
	,	summary
	,	capped: all.length > MAX_RESULT_ROWS
	,	races
	,	...( kind === 'horse' ? HorseFamily( clusters, code, master ) : {} )
	}
}

//	馬名検索（馬一覧・KettoNum付き）— um.bamei 索引
const
SearchHorses = ( clusters, text, type ) => {
	const
	um = clusters.jv.jv_um_uma
	,	bamei = um.secondary?.bamei
	if ( !bamei ) throw Object.assign( new Error( 'bamei index not built' ), { status: 500 } )
	const
	needle = String( text ?? '' )
	,	Match = type === '前方一致'	? n => n.startsWith( needle )
		:	type === '後方一致'		? n => n.endsWith( needle )
		:	type === '含む'			? n => n.includes( needle )
		:	n => n === needle
	,	out = []
	for ( const [ name, kettos ] of bamei ) {
		if ( !needle || !Match( name ) ) continue
		for ( const ketto of kettos ) {
			const
			line = um.get( String( ketto ) )
			if ( !line ) continue
			const
			u = JSON.parse( line )
			out.push( {
				ketto: String( ketto )
			,	bamei: String( u.Bamei ?? '' ).trim()
			,	sex: SexCDStr( u.SexCD )
			,	birth: u.BirthDate_Year ? String( u.BirthDate_Year ) : ''
			,	sire: String( u.Ketto3Info_0_Bamei ?? '' ).trim()
			,	dam: String( u.Ketto3Info_1_Bamei ?? '' ).trim()
			} )
		}
		if ( out.length > 300 ) break
	}
	return out.sort( ( a, b ) => ( Number( b.birth ) - Number( a.birth ) ) || a.bamei.localeCompare( b.bamei ) )
}

///////////////////////////////	出走表（レースカード）

//	データにある最新開催週 = 最新年の直近3開催日 の (日付,場,回,日) 一覧
const
LatestWeek = clusters => {
	const
	ra = clusters.jv.jv_ra_race
	let
	year = new Date().getFullYear()
	,	dates = []
	const
	Central = jyo => Number( jyo ) >= 1 && Number( jyo ) <= 10	//	中央10場
	//	直近3開催日は中央基準で決める
	for ( ; year >= 1986; year-- ) {
		const
		set = new Set()
		for ( const [ key ] of ra.scan( `${ year }|` ) ) { const p = key.split( '|' ); if ( Central( p[ 2 ] ) ) set.add( p[ 1 ] ) }
		if ( set.size ) { dates = [ ...set ].sort(); break }
	}
	if ( !dates.length ) return { year: null, days: [] }

	//	中央の直近3日 + その週内(最古中央日以降)の地方交流戦も含める
	const
	lastDates = new Set( dates.slice( -3 ) )
	,	earliest = dates.slice( -3 )[ 0 ]
	,	days = new Map()
	for ( const [ key ] of ra.scan( `${ year }|` ) ) {
		const
		[ , monthday, jyo, kaiji, nichiji ] = key.split( '|' )
		,	nar = !Central( jyo )
		if ( nar ? monthday < earliest : !lastDates.has( monthday ) ) continue
		const
		k = `${ monthday }|${ jyo }|${ kaiji }|${ nichiji }`
		;( days.get( k ) ?? days.set( k, { year: String( year ), monthday, jyo, jyoName: JyoCD2StrJPN( jyo ) || jyo, nar, kaiji, nichiji, count: 0 } ).get( k ) ).count++
	}
	return { year: String( year ), days: [ ...days.values() ].sort( ( a, b ) => b.monthday.localeCompare( a.monthday ) || Number( a.nar ) - Number( b.nar ) || a.jyo.localeCompare( b.jyo ) ) }
}

//	このレース日より前の確定成績から、出走数と着別度数 [1,2,3,4,5,着外] を集計。
//	1走だけの馬はその1戦の着順(chaku)/異常区分(ijyo)も返す。
const
CareerRecord = ( se, ketto, raceDate ) => {
	const
	rec = [ 0, 0, 0, 0, 0, 0 ]
	let
	starts = 0
	,	soleChaku = 0
	,	soleIjyo = '0'
	for ( const key of se.lookup( 'ketto', String( ketto ) ) ) {
		const
		p = key.split( '|' )
		if ( Number( `${ p[ 0 ] }${ p[ 1 ] }` ) >= raceDate ) continue
		const
		line = se.get( key )
		if ( !line ) continue
		const
		h = JSON.parse( line )
		if ( ![ '7', 'A', 'B' ].includes( h.head_DataKubun ) ) continue
		starts++
		const
		j = Number( h.KakuteiJyuni )
		rec[ j >= 1 && j <= 5 ? j - 1 : 5 ]++
		soleChaku = j					//	starts===1 ならこれが唯一の1戦の着順
		soleIjyo = String( h.IJyoCD ?? '0' )
	}
	return { starts, rec, chaku: starts === 1 ? soleChaku : 0, ijyo: starts === 1 ? soleIjyo : '0' }
}

//	未出走(0走)=CONTENT1(デビュー前評価), 1走=CONTENT2(初戦後短評) を oldmac.o_new_horse から
const
NewHorseComment = ( clusters, ketto, priorStarts ) => {
	const
	oh = OldmacHorseIndex( clusters ).byKetto.get( String( ketto ) )
	if ( !oh ) return null
	const
	nh = clusters.oldmac.o_new_horse
	,	line = nh.getByKey( String( oh.HORSE ) )
	if ( !line ) return null
	const
	f = nh.meta().fields
	,	r = JSON.parse( line )
	,	get = name => String( r[ f.indexOf( name ) ] ?? '' ).trim()
	,	text = priorStarts === 0 ? get( 'CONTENT1' ) : get( 'CONTENT2' )
	if ( !text ) return null
	return { syosen: get( 'SYOSEN' ), text, phase: priorStarts === 0 ? 'デビュー前' : '初戦後' }
}

const
RaceCard = ( clusters, { year, monthday, jyo, kaiji, nichiji, racenum } ) => {
	const
	se = clusters.jv.jv_se_race_uma
	,	raceDate = Number( `${ year }${ monthday }` )
	,	ra = RaceByKey( clusters, [ year, monthday, jyo, kaiji, nichiji, racenum ].join( '|' ) )
	,	horses = []
	for ( const [ , line ] of se.scan( `${ year }|${ monthday }|${ jyo }|${ kaiji }|${ nichiji }|${ racenum }|` ) ) {
		const
		h = JSON.parse( line )
		//	'2'=出馬表(未施行), '7'/'A'/'B'=確定成績。どちらも出走表として扱う。
		if ( ![ '2', '7', 'A', 'B' ].includes( h.head_DataKubun ) ) continue
		const
		{ starts, rec, chaku, ijyo } = CareerRecord( se, h.KettoNum, raceDate )
		,	comment = starts <= 1 ? NewHorseComment( clusters, h.KettoNum, starts ) : null
		horses.push( {
			wakuban: h.Wakuban, umaban: h.Umaban, ketto: String( h.KettoNum )
		,	bamei: String( h.Bamei ?? '' ).trim()
		,	sexBarei: `${ SexShort( h.SexCD ) }${ Number( h.Barei ) || '' }`
		,	futan: h.Futan
		,	jockey: String( h.KisyuRyakusyo ?? '' ).trim()
		,	chokyosi: String( h.ChokyosiRyakusyo ?? '' ).trim()
		,	tozai: TozaiStr( h.TozaiCD )
		,	baTaijyu: h.BaTaijyu, zogenFugo: h.ZogenFugo, zogenSa: h.ZogenSa
		,	priorStarts: starts, comment
		,	record: starts >= 2 ? rec : null	//	[1,2,3,4,5,着外]
		,	soleChaku: chaku, soleIjyo: ijyo	//	1走の着順(0=なし)/異常区分
		} )
	}
	horses.sort( ( a, b ) => Number( a.umaban ) - Number( b.umaban ) )

	const
	td = ra ? TDH( ra ) : ''
	return {
		race: ra ? {
			title: RaceName( ra ), grade: String( ra.GradeCD ?? '' ), td, distance: AsInt( ra, 'Kyori' )
		,	jyoName: JyoCD2StrJPN( jyo ) || jyo, racenum: String( racenum ), year, monthday, kaiji, nichiji
		,	tosu: AsInt( ra, 'SyussoTosu' ) || AsInt( ra, 'TorokuTosu' )
		,	baba: td === 'ダ' ? BabaD( ra ) : BabaT( ra )
		} : null
	,	horses
	}
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
	'/api/calendar': async ( Q, S ) => {
		const
		q = QueryOf( Q )
		SendJSONable( S, Calendar( clusters, q.get( 'year' ), q.get( 'jyo' ) ) )
	}
,	'/api/year-races': async ( Q, S ) => {
		const
		q = QueryOf( Q )
		SendJSONable( S, YearRaces( clusters, q.get( 'year' ) ) )
	}
,	'/api/ranking': async ( Q, S ) => {
		const
		q = QueryOf( Q )
		try {
			SendJSONable( S, Ranking( clusters, q.get( 'from' ), q.get( 'to' ), q.get( 'kind' ) ) )
		} catch ( e ) {
			if ( !e.status ) throw e
			Send( S, e.status, e.message )
		}
	}
,	'/api/results': async ( Q, S ) => {
		const
		q = QueryOf( Q )
		try {
			SendJSONable( S, EntityResults( clusters, q.get( 'kind' ), q.get( 'code' ), q.get( 'from' ), q.get( 'to' ) ) )
		} catch ( e ) {
			if ( !e.status ) throw e
			Send( S, e.status, e.message )
		}
	}
,	'/api/horses': async ( Q, S ) => {
		const
		q = QueryOf( Q )
		try {
			SendJSONable( S, SearchHorses( clusters, q.get( 'text' ) ?? '', q.get( 'type' ) ?? '前方一致' ) )
		} catch ( e ) {
			if ( !e.status ) throw e
			Send( S, e.status, e.message )
		}
	}
,	'/api/latest-week': async ( Q, S ) => {
		SendJSONable( S, LatestWeek( clusters ) )
	}
,	'/api/racecard': async ( Q, S ) => {
		const
		q = QueryOf( Q )
		SendJSONable( S, RaceCard( clusters, {
			year: q.get( 'year' ), monthday: q.get( 'monthday' ), jyo: q.get( 'jyo' )
		,	kaiji: q.get( 'kaiji' ), nichiji: q.get( 'nichiji' ), racenum: q.get( 'racenum' )
		} ) )
	}
,	'/api/race-day': async ( Q, S ) => {
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
