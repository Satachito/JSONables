//	Pure JV-Data code translators used by the server race import.
//	Records are Full-JSON objects with trimmed string values.

export const
AsStr = ( row, name ) => row?.[ name ] == null ? '' : String( row[ name ] )

export const
AsInt = ( row, name ) => {
	const
	v = parseInt( row?.[ name ], 10 )
	return Number.isNaN( v ) ? 0 : v
}

export const
ZStr = p => {
	let v = ''
	while ( p > 0 ) {
		v = '０１２３４５６７８９'[ p % 10 ] + v
		p = Math.floor( p / 10 )
	}
	return v
}

export const
TrackCode = p => ( {
	'札幌': '01', '函館': '02', '福島': '03', '新潟': '04', '東京': '05'
,	'中山': '06', '中京': '07', '京都': '08', '阪神': '09', '小倉': '10'
}[ p ] ?? '' )

export const
TrackName = p => ( {
	'01': '札幌', '02': '函館', '03': '福島', '04': '新潟', '05': '東京'
,	'06': '中山', '07': '中京', '08': '京都', '09': '阪神', '10': '小倉'
}[ p ] ?? null )

const
TURF		= new Set( [ '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22' ] )
const
DIRT		= new Set( [ '23', '24', '25', '26', '27', '28', '29' ] )
const
HURDLE_TURF	= new Set( [ '51', '53', '54', '55', '56', '57', '58', '59' ] )

export const
PTDHTD = race => {
	const
	cd = AsStr( race, 'TrackCD' )
	return TURF.has( cd ) ? 1 : DIRT.has( cd ) ? 2 : HURDLE_TURF.has( cd ) ? 3 : cd === '52' ? 4 : 0
}

//	平地の芝/ダ (障害は襷等含め芝扱い、52 芝→ダはダ)
export const
TD = race => {
	const
	cd = AsStr( race, 'TrackCD' )
	return TURF.has( cd ) || HURDLE_TURF.has( cd ) ? '芝' : DIRT.has( cd ) || cd === '52' ? 'ダ' : ''
}

export const
TDH = race => {
	const
	cd = AsStr( race, 'TrackCD' )
	return TURF.has( cd ) ? '芝' : DIRT.has( cd ) ? 'ダ' : HURDLE_TURF.has( cd ) || cd === '52' ? '障' : ''
}

//	平地 1 / 障害 2
export const
PH = race => {
	const
	cd = AsStr( race, 'TrackCD' )
	return TURF.has( cd ) || DIRT.has( cd ) ? 1 : HURDLE_TURF.has( cd ) || cd === '52' ? 2 : 0
}

export const
LRS = race => {
	const
	cd = AsStr( race, 'TrackCD' )
	if ( [ '11', '12', '13', '14', '15', '16', '23', '25', '27' ].includes( cd ) ) return '左'
	if ( [ '17', '18', '19', '20', '21', '22', '24', '26', '28' ].includes( cd ) ) return '右'
	if ( cd === '10' || cd === '29' ) return '直'
	return ''
}

export const
Tenko = race => ( {
	'1': '晴', '2': '曇', '3': '雨', '4': '小雨', '5': '雪', '6': '小雪'
}[ AsStr( race, 'TenkoBaba_TenkoCD' ) ] ?? '' )

export const
Baba = ( race, code ) => ( {
	'1': '良', '2': '稍重', '3': '重', '4': '不良'
}[ AsStr( race, code ) ] ?? '' )

export const
BabaT = race => Baba( race, 'TenkoBaba_SibaBabaCD' )

export const
BabaD = race => Baba( race, 'TenkoBaba_DirtBabaCD' )

export const
JyokenInfo_SyubetuCD_Futo = p => ( {
	11: 'サラ二才', 12: 'サラ三才', 13: 'サラ三才上', 14: 'サラ四才上'
,	18: 'サラ障害', 19: 'サラ障害'
,	21: 'アラブ二才', 22: 'アラブ三才', 23: 'アラブ三才上', 24: 'アラブ四才上'
}[ p ] ?? '' )

export const
JyokenInfo_SyubetuCD_Hondai = p => ( {
	11: 'サラ二歳', 12: 'サラ三歳', 13: 'サラ三歳以上', 14: 'サラ四歳以上'
,	18: 'サラ障害', 19: 'サラ障害'
,	21: 'アラブ二歳', 22: 'アラブ三歳', 23: 'アラブ三歳以上', 24: 'アラブ四歳以上'
}[ p ] ?? '' )

export const
JyokenInfo_KigoCD_Futo = p => ( {
	'000': '', '001': '⚑', '002': '', '003': '', '004': '♨'
,	'020': '⚒', '021': '⚒⚑', '023': '⚒', '024': '⚒♨'
,	'030': '牡・せん・', '031': '牡・せん⚑', '033': '牡・せん・', '034': '牡・せん♨'
,	'040': '牡・牝・', '041': '牡・牝⚑', '043': '牡・牝・', '044': '牡・牝♨'
,	'A00': '⚐', 'A01': '⚐⚑', 'A02': '⚐', 'A03': '⚐', 'A04': '⚐♨'
,	'A10': '⚐', 'A11': '⚐⚑', 'A13': '⚐', 'A14': '⚐♨'
,	'A20': '⚒⚐', 'A21': '⚒⚐⚑', 'A23': '⚒⚐', 'A24': '⚒⚐♨'
,	'A30': '牡・せん⚐', 'A31': '牡・せん⚐⚑', 'A33': '牡・せん⚐', 'A34': '牡・せん⚐♨'
,	'A40': '牡・牝⚐', 'A41': '牡・牝⚐⚑'
,	'B00': '', 'B01': '⚑', 'B03': '', 'B04': '♨'
,	'C00': '', 'C01': '⚑', 'C03': '', 'C04': '♨'
,	'D00': '', 'D01': '⚑', 'D03': ''
,	'E00': '', 'E01': '⚑', 'E03': ''
,	'F00': '', 'F01': '⚑', 'F03': '', 'F04': '♨'
,	'G00': '', 'G01': '⚑', 'G03': ''
,	'H00': '', 'H01': '⚑'
,	'I00': '', 'I01': '⚑', 'I03': ''
,	'J00': '', 'J01': '⚑'
,	'K00': '', 'K01': '⚑', 'K03': ''
,	'L00': '', 'L01': '⚑', 'L03': ''
,	'M00': '九州産・', 'M01': '九州産⚑', 'M03': '九州産・', 'M04': '九州産♨'
,	'N00': '', 'N01': '⚑', 'N03': '', 'N04': '♨'
,	'N20': '⚒', 'N21': '⚒⚑', 'N23': '⚒', 'N24': '⚒♨'
,	'N30': '牡・せん・', 'N31': '牡・せん⚑'
,	'N40': '牡・牝・', 'N41': '牡・牝⚑', 'N44': '牡・牝♨'
}[ p ] ?? '' )

export const
JyokenInfo_JyuryoCD_Futo = p => ( {
	1: '・ハンデ', 2: '・別定', 3: '・馬齢', 4: '・定量'
}[ p ] ?? '' )

export const
JyokenInfo_JyokenCD_4_OLD = p => ( {
	5: '➘', 10: '➙', 16: '➚', 100: '１億下'
,	701: '新馬', 702: '　未　出　走', 703: '　未　勝　利', 999: '➗'
}[ p ] ?? '' )

export const
JyokenInfo_JyokenCD_4 = p => ( {
	5: '１勝', 10: '２勝', 16: '３勝', 100: '１億下'
,	701: '新馬', 702: '未出走', 703: '未勝利', 999: '➗'
}[ p ] ?? '' )

const
SubstringWrapper = ( str, d1, d2 ) => {
	const
	begin = str.indexOf( d1 )
,	end = str.indexOf( d2 )
	return begin === -1 || end === -1 ? '' : str.substring( begin, end + 1 )
}

export const
Title_Jyoken = race => {
	const
	hondai = AsStr( race, 'RaceInfo_Hondai' )
,	syubetu = JyokenInfo_SyubetuCD_Futo( AsInt( race, 'JyokenInfo_SyubetuCD' ) )
,	jyokenCode = AsInt( race, 'JyokenInfo_JyokenCD_4' )
,	jyoken = AsInt( race, 'id_Year' ) * 10000 + AsInt( race, 'id_MonthDay' ) < 20190601
	?	JyokenInfo_JyokenCD_4_OLD( jyokenCode )
	:	JyokenInfo_JyokenCD_4( jyokenCode )
,	kigo = JyokenInfo_KigoCD_Futo( AsStr( race, 'JyokenInfo_KigoCD' ) )
,	jyuryo = JyokenInfo_JyuryoCD_Futo( AsInt( race, 'JyokenInfo_JyuryoCD' ) )

	let
	w = kigo + ( hondai.length > 0 ? syubetu : '' ) + jyoken + ( jyokenCode === 702 || jyokenCode === 703 ? '' : jyuryo )

	//	TEIRYO_DETAIL is an app-side column; absent on raw JV records.
	let
	teiryo = AsStr( race, 'TEIRYO_DETAIL' )
	const
	kaku = SubstringWrapper( teiryo, '[', ']' )
	if ( kaku !== '' ) teiryo = teiryo.replace( kaku, '　' )
	return w + teiryo
}

export const
Course = race => ( {
	'10': '芝・直', '11': '芝・左', '12': '芝・左外', '13': '芝・左内→外', '14': '芝・左外→内'
,	'15': '芝・左内２周', '16': '芝・左外２周', '17': '芝・右', '18': '芝・右外', '19': '芝・右内→外'
,	'20': '芝・右外→内', '21': '芝・右内２周', '22': '芝・右外２周'
,	'23': 'ダート・左', '24': 'ダート・右', '25': 'ダート・左内', '26': 'ダート・右外'
,	'27': 'サンド・左', '28': 'サンド・右', '29': 'ダート・直'
,	'51': '芝・襷', '52': '芝→ダート', '53': '芝・左', '54': '芝', '55': '芝・外'
,	'56': '芝・外→内', '57': '芝・内→外', '58': '芝・内２周', '59': '芝・外２周'
}[ AsStr( race, 'TrackCD' ) ] ?? '' )

const
Lap = ( race, i ) => AsInt( race, `LapTime_${ i }` )

export const
CalcFirst3Raw = race => {
	const
	base = Lap( race, 0 ) + Lap( race, 1 ) + Lap( race, 2 )
	switch ( Math.floor( AsInt( race, 'Kyori' ) / 50 ) % 4 ) {
	case 0:	return base
	case 1:	return base + Math.floor( Lap( race, 3 ) * 3 / 4 )
	case 2:	return base + Math.floor( Lap( race, 3 ) / 2 )
	case 3:	return base + Math.floor( Lap( race, 3 ) / 4 )
	}
	return 0
}

export const
CalcLast3Raw = race => {
	const
	last = Math.floor( ( AsInt( race, 'Kyori' ) + 199 ) / 200 )
	return Lap( race, last - 1 ) + Lap( race, last - 2 ) + Lap( race, last - 3 )
}

export const
CalcFirst4Raw = race => {
	const
	base = Lap( race, 0 ) + Lap( race, 1 ) + Lap( race, 2 ) + Lap( race, 3 )
	switch ( Math.floor( AsInt( race, 'Kyori' ) / 50 ) % 4 ) {
	case 0:	return base
	case 1:	return base + Math.floor( Lap( race, 4 ) * 3 / 4 )
	case 2:	return base + Math.floor( Lap( race, 4 ) / 2 )
	case 3:	return base + Math.floor( Lap( race, 4 ) / 4 )
	}
	return 0
}

export const
CalcLast4Raw = race => {
	const
	last = Math.floor( ( AsInt( race, 'Kyori' ) + 199 ) / 200 )
	return Lap( race, last - 1 ) + Lap( race, last - 2 ) + Lap( race, last - 3 ) + Lap( race, last - 4 )
}

export const
CalcFirst5Raw = race => {
	const
	base = Lap( race, 0 ) + Lap( race, 1 ) + Lap( race, 2 ) + Lap( race, 3 ) + Lap( race, 4 )
	switch ( Math.floor( AsInt( race, 'Kyori' ) / 50 ) % 4 ) {
	case 0:	return base
	case 1:	return base + Math.floor( Lap( race, 5 ) * 3 / 4 )
	case 2:	return base + Math.floor( Lap( race, 5 ) / 2 )
	case 3:	return base + Math.floor( Lap( race, 5 ) / 4 )
	}
	return 0
}

export const
CalcLast5Raw = race => {
	const
	last = Math.floor( ( AsInt( race, 'Kyori' ) + 199 ) / 200 )
	return Lap( race, last - 1 ) + Lap( race, last - 2 ) + Lap( race, last - 3 ) + Lap( race, last - 4 ) + Lap( race, last - 5 )
}

const
CalcRacePaceTurf = race => {
	const
	kyori = AsInt( race, 'Kyori' )
	switch ( kyori ) {
	case 1000: {
		const
		first3 = CalcFirst3Raw( race )
		switch ( AsStr( race, 'JyokenInfo_SyubetuCD' ) ) {
		case '11':	return first3 <= 349 ? 'Ｈ' : 'Ｍ'
		case '12':	case '13':	case '14':
					return first3 <= 342 ? 'Ｈ' : 'Ｍ'
		case '21':	case '22':	case '23':	case '24':
					return first3 <= 354 ? 'Ｈ' : first3 <= 360 ? 'Ｍ' : 'Ｓ'
		default:	return 'Ｍ'
		}
	}
	case 1200: {
		const diff = CalcLast3Raw( race ) - CalcFirst3Raw( race )
		return diff >= 21 ? 'Ｈ' : diff >= 5 ? 'Ｍ' : 'Ｓ'
	}
	case 1400:
	case 1500: {
		const diff = CalcLast3Raw( race ) - CalcFirst3Raw( race )
		return diff >= 31 ? 'Ｈ' : diff >= 10 ? 'Ｍ' : 'Ｓ'
	}
	case 1600:
	case 1700: {
		const diff = CalcLast4Raw( race ) - CalcFirst4Raw( race )
		return diff >= 26 ? 'Ｈ' : diff >= 5 ? 'Ｍ' : 'Ｓ'
	}
	case 1800: {
		const diff = CalcLast4Raw( race ) - CalcFirst4Raw( race )
		return diff >= 16 ? 'Ｈ' : diff >= -5 ? 'Ｍ' : 'Ｓ'
	}
	default:
		if ( kyori >= 2000 ) {
			const diff = CalcLast5Raw( race ) - CalcFirst5Raw( race )
			return diff >= 11 ? 'Ｈ' : diff >= -5 ? 'Ｍ' : 'Ｓ'
		}
		return 'Ｍ'
	}
}

const
CalcRacePaceDirt = race => {
	const
	kyori = AsInt( race, 'Kyori' )
	switch ( kyori ) {
	case 1000: {
		const
		first3 = CalcFirst3Raw( race )
		switch ( AsStr( race, 'JyokenInfo_SyubetuCD' ) ) {
		case '11':	case '12':	case '13':	case '14':
					return first3 <= 349 ? 'Ｈ' : 'Ｍ'
		case '21':	case '22':	case '23':	case '24':
					return first3 <= 359 ? 'Ｈ' : 'Ｍ'
		default:	return 'Ｍ'
		}
	}
	case 1150:
	case 1200:
	case 1300:
	case 1400: {
		const diff = CalcLast3Raw( race ) - CalcFirst3Raw( race )
		return diff >= 31 ? 'Ｈ' : diff >= 10 ? 'Ｍ' : 'Ｓ'
	}
	case 1600:
	case 1700:
	case 1800:
	case 1900: {
		const diff = CalcLast4Raw( race ) - CalcFirst4Raw( race )
		return diff >= 31 ? 'Ｈ' : diff >= 10 ? 'Ｍ' : 'Ｓ'
	}
	case 2000: {
		const diff = CalcLast5Raw( race ) - CalcFirst5Raw( race )
		return diff >= 31 ? 'Ｈ' : diff >= 10 ? 'Ｍ' : 'Ｓ'
	}
	default:
		if ( kyori >= 2100 ) {
			const diff = CalcLast5Raw( race ) - CalcFirst5Raw( race )
			return diff >= 21 ? 'Ｈ' : diff >= 0 ? 'Ｍ' : 'Ｓ'
		}
		return 'Ｍ'
	}
}

export const
TrackCDString = code =>
	TURF.has( code ) || HURDLE_TURF.has( code ) || code === '52' ? '芝'
:	code === '27' || code === '28' ? '全'
:	DIRT.has( code ) ? 'ダ'
:	''

export const
CalcRacePace = race => {
	if ( Lap( race, 0 ) === 0 ) return ' '
	switch ( TrackCDString( AsStr( race, 'TrackCD' ) ) ) {
	case '芝':	return CalcRacePaceTurf( race )
	case 'ダ':	return CalcRacePaceDirt( race )
	default:	return 'Ｍ'
	}
}

export const
TrackCDString_UchiSoto = cd =>
	[ '12', '16', '18', '22', '26', '55', '59' ].includes( cd ) ? '外'
:	[ '15', '21', '25', '58' ].includes( cd ) ? '内'
:	''

export const
UmakigoCDString = p => {
	switch ( p ) {
	case  6: case 16: case 20:				return '♿'	//	○外
	case  5: case  9: case 10: case 12:		return '⚁'	//	○地
	case 26: case 27:						return '⚀'	//	□外
	case 21: case 23: case 24: case 25:		return '⚂'	//	□地
	case 11: case 40:						return '⚈'	//	○外地
	case 22: case 41:						return '⚉'	//	□外地
	default:								return null
	}
}

export const
KeiroCDString = p => ( {
	'01': '栗毛', '02': '栃栗', '03': '鹿毛', '04': '黒鹿', '05': '青鹿'
,	'06': '青毛', '07': '芦毛', '08': '栗粕', '09': '鹿粕', '10': '青粕', '11': '白毛'
}[ p ] ?? '' )

const
JYO_NAMES = {
	'01': '札幌', '02': '函館', '03': '福島', '04': '新潟', '05': '東京'
,	'06': '中山', '07': '中京', '08': '京都', '09': '阪神', '10': '小倉'
,	'30': '門別', '31': '北見', '32': '岩見', '33': '帯広', '34': '旭川'
,	'35': '盛岡', '36': '水沢', '37': '上山', '38': '三条', '39': '足利'
,	'40': '宇都', '41': '高崎', '42': '浦和', '43': '船橋', '44': '大井'
,	'45': '川崎', '46': '金沢', '47': '笠松', '48': '名古', '49': '紀三'
,	'50': '園田', '51': '姫路', '52': '益田', '53': '福山', '54': '高知'
,	'55': '佐賀', '56': '荒尾', '57': '中津', '58': '札幌', '59': '函館'
,	'60': '新潟', '61': '中京'
}

const
FOREIGN_NAMES = {
	'A0': '他外', 'A2': '日本', 'A4': 'アメ', 'A6': 'イギ', 'A8': 'フラ'
,	'B0': 'イン', 'B2': 'アイ', 'B4': 'ニュ', 'B6': 'オー', 'B8': 'カナ'
,	'C0': 'イタ', 'C2': 'ドイ', 'C5': 'オマ', 'C6': 'イラ', 'C7': 'ア首', 'C8': 'シリ'
,	'D0': 'スウ', 'D2': 'ハン', 'D4': 'ポル', 'D6': 'ロシ', 'D8': 'ウル'
,	'E0': 'ペル', 'E2': 'アル', 'E4': 'ブラ', 'E6': 'ベル', 'E8': 'トル'
,	'F0': '韓国', 'F1': '中国', 'F2': 'チリ', 'F8': 'パナ'
,	'G0': '香港', 'G2': 'スペ'
,	'H0': '西独', 'H2': '南ア', 'H4': 'スイ', 'H6': 'モナ', 'H8': 'フィ'
,	'I0': 'プエ', 'I2': 'コロ', 'I4': 'チェ', 'I6': 'チェ', 'I8': 'スロ'
,	'J0': 'エク', 'J2': 'ギリ', 'J4': 'マレ', 'J6': 'メキ', 'J8': 'モロ'
,	'K0': 'パキ', 'K2': 'ポー', 'K4': 'パラ', 'K6': 'サウ', 'K8': 'キプ'
,	'L0': 'タイ', 'L2': 'ウク', 'L4': 'ベネ', 'L6': 'ユー', 'L8': 'デン'
,	'M0': 'シン', 'M2': '澳門', 'M4': '墺', 'M6': '約', 'M8': '華'
}

export const
JyoCD2Str = p => JYO_NAMES[ p ] ?? FOREIGN_NAMES[ p ] ?? '地方'

export const
JyoCD2StrJPN = p => JYO_NAMES[ p ] ?? ''

//	JRA/主要地方は外字1文字 (0x27a1..)、それ以外は JyoCD2Str と同じ。
const
JYO_GAIJI = {
	'01': '➡', '02': '➢', '03': '➣', '04': '➤', '05': '➥'
,	'06': '➦', '07': '➧', '08': '➨', '09': '➩', '10': '➪'
,	'30': '➬', '35': '➱', '36': '➲'
,	'42': '➸', '43': '➹', '44': '➺', '45': '➻', '46': '➼'
,	'47': '➽', '48': '➾', '50': '⟀', '51': '⟁'
,	'54': '⟄', '55': '⟅', '58': '⟈', '61': '⟋'
}

export const
JyoCD2Str2 = p => JYO_GAIJI[ p ] ?? JYO_NAMES[ p ] ?? FOREIGN_NAMES[ p ] ?? '地方'

export const
CourseAbbreviation = p => ( {
	'門別': '➬', '盛岡': '➱', '水沢': '➲', '浦和': '➸', '船橋': '➹'
,	'大井': '➺', '川崎': '➻', '金沢': '➼', '笠松': '➽', '名古屋': '➾'
,	'園田': '⟀', '姫路': '⟁', '高知': '⟄', '佐賀': '⟅', '札幌': '⟈'
,	'中京': '⟋'
}[ p ] ?? p )

export const
IsKana = c => {
	const
	p = c.charCodeAt( 0 )
	return 0x3040 <= p && p <= 0x3100
}

export const
AdjustRomanNum = p => {
	const
	map = { 'Ⅰ': '♲', 'Ⅱ': '♳', 'Ⅲ': '♴', 'Ⅳ': '♵', 'Ⅴ': '♶', 'Ⅵ': '♷', 'Ⅶ': '♸', 'Ⅷ': '♹', 'Ⅸ': '♺', 'Ⅹ': '♻' }
	return p.replace( /[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g, c => map[ c ] )
}

//	"12"（quoted number）→ 私用領域外字 (0xf100 + n)
export const
ReplaceNum = p => {
	const
	wS = p.indexOf( '"' )
	if ( wS === -1 ) return p
	const
	wE = p.indexOf( '"', wS + 1 )
	if ( wE === -1 ) return p
	const
	w = parseInt( p.substring( wS + 1, wE ), 10 )
	if ( Number.isNaN( w ) ) return p
	return p.substring( 0, wS ) + String.fromCharCode( 0xf100 + w ) + ReplaceNum( p.substring( wE + 1 ) )
}
