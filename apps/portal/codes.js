//	JV-Data code translators for the browser portal (client-side subset of
//	data/deumacodes.js — /data/ is not served, so the maps we need live here).

const
JYO_NAMES = {
	'01': '札幌', '02': '函館', '03': '福島', '04': '新潟', '05': '東京'
,	'06': '中山', '07': '中京', '08': '京都', '09': '阪神', '10': '小倉'
,	'30': '門別', '35': '盛岡', '36': '水沢', '42': '浦和', '43': '船橋'
,	'44': '大井', '45': '川崎', '46': '金沢', '47': '笠松', '48': '名古屋'
,	'50': '園田', '51': '姫路', '54': '高知', '55': '佐賀'
}

//	海外主場コード（JVData の外国コード表の抜粋）
const
FOREIGN_NAMES = {
	'A4': '米', 'A6': '英', 'A8': '仏', 'B6': '豪', 'C7': 'ＵＡＥ'
,	'F0': '韓国', 'G0': '香港', 'H2': '南ア', 'M0': 'シンガポール', 'M2': 'マカオ'
}

export const
JyoName = p => JYO_NAMES[ p ] ?? FOREIGN_NAMES[ p ] ?? p

//	Central tracks, in code order — used to build the venue selector.
export const
JRA_TRACKS = [ '01', '02', '03', '04', '05', '06', '07', '08', '09', '10' ]

const
TURF		= new Set( [ '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22' ] )
const
DIRT		= new Set( [ '23', '24', '25', '26', '27', '28', '29' ] )
const
HURDLE		= new Set( [ '51', '52', '53', '54', '55', '56', '57', '58', '59' ] )

//	芝 / ダ / 障
export const
TrackType = cd => TURF.has( cd ) ? '芝' : DIRT.has( cd ) ? 'ダ' : HURDLE.has( cd ) ? '障' : ''

export const
Turn = cd =>
	[ '11', '12', '13', '14', '15', '16', '23', '25', '27' ].includes( cd ) ? '左'
:	[ '17', '18', '19', '20', '21', '22', '24', '26', '28' ].includes( cd ) ? '右'
:	cd === '10' || cd === '29' ? '直'
:	''

export const
UchiSoto = cd =>
	[ '12', '16', '18', '22', '26', '55', '59' ].includes( cd ) ? '外'
:	[ '15', '21', '25', '58' ].includes( cd ) ? '内'
:	''

export const
Grade = cd => ( {
	'A': 'GⅠ', 'B': 'GⅡ', 'C': 'GⅢ', 'D': '重賞', 'E': '', 'F': 'L'
,	'G': '', 'H': '', 'L': 'L'
}[ cd ] ?? '' )

export const
Sex = cd => ( { '1': '牡', '2': '牝', '3': 'セ' }[ cd ] ?? '' )

const
SYUBETU = {
	11: 'サラ二歳', 12: 'サラ三歳', 13: 'サラ三歳以上', 14: 'サラ四歳以上'
,	18: 'サラ障害', 19: 'サラ障害'
,	21: 'アラブ二歳', 22: 'アラブ三歳', 23: 'アラブ三歳以上', 24: 'アラブ四歳以上'
}
const
JYOKEN4 = { 5: '１勝', 10: '２勝', 16: '３勝', 100: '１億下', 701: '新馬', 702: '未出走', 703: '未勝利' }

//	レース名: 本題→略称→条件名→（条件戦は 種別＋クラスを合成）
export const
RaceName = ra => {
	const
	hondai = String( ra.RaceInfo_Hondai ?? '' ).trim()
	if ( hondai ) return hondai
	const
	ryaku = String( ra.RaceInfo_Ryakusyo6 ?? '' ).trim()
	if ( ryaku ) return ryaku
	const
	jyoken = String( ra.JyokenName ?? '' ).trim()
	if ( jyoken ) return jyoken
	return [ SYUBETU[ Number( ra.JyokenInfo_SyubetuCD ) ] ?? '', JYOKEN4[ Number( ra.JyokenInfo_JyokenCD_4 ) ] ?? '' ].filter( Boolean ).join( ' ' ).trim()
}

export const
Keiro = cd => ( {
	'01': '栗毛', '02': '栃栗', '03': '鹿毛', '04': '黒鹿', '05': '青鹿'
,	'06': '青毛', '07': '芦毛', '08': '栗粕', '09': '鹿粕', '10': '青粕', '11': '白毛'
}[ cd ] ?? '' )

export const
Tozai = cd => ( { '1': '美浦', '2': '栗東', '3': '地方', '4': '海外' }[ cd ] ?? '' )

export const
Tenko = cd => ( { '1': '晴', '2': '曇', '3': '雨', '4': '小雨', '5': '雪', '6': '小雪' }[ cd ] ?? '' )

export const
Baba = cd => ( { '1': '良', '2': '稍重', '3': '重', '4': '不良' }[ cd ] ?? '' )

//	"YYYY" + "MMDD" → "YYYY/MM/DD"
export const
Date8 = ( year, monthday ) => `${ year }/${ String( monthday ).slice( 0, 2 ) }/${ String( monthday ).slice( 2, 4 ) }`

//	JV Time "1234" (分秒コンマ秒, 下1桁=1/10秒) → "1:23.4"
export const
RaceTime = t => {
	const
	d = String( t ?? '' ).trim()
	if ( !/^\d+$/.test( d ) || Number( d ) === 0 ) return ''
	const
	tenth	= d.slice( -1 )
,	sec		= d.slice( -3, -1 ).padStart( 2, '0' )
,	min		= d.slice( 0, -3 ) || '0'
	return `${ min }:${ sec }.${ tenth }`
}

//	JV Odds "0035" (×10) → "3.5"
export const
Odds = o => {
	const
	n = Number( o )
	return n > 0 ? ( n / 10 ).toFixed( 1 ) : ''
}

//	上がりハロン "0343" (×10, 1/10秒) → "34.3"
export const
Furlong = f => {
	const
	n = Number( f )
	return n > 0 ? ( n / 10 ).toFixed( 1 ) : ''
}

//	馬体重 "480" + 増減符号 "+"/"-"/" " + 増減差 "004" → "480(+4)"
export const
Weight = ( ba, fugo, sa ) => {
	if ( !Number( ba ) ) return ''
	const
	diff = Number( sa )
	if ( !diff || fugo === ' ' || fugo === '' ) return `${ Number( ba ) }`
	return `${ Number( ba ) }(${ fugo === '-' ? '-' : '+' }${ diff })`
}
