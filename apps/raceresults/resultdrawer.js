//	Canvas port of RaceResults/ResultDrawer.cs. Renders one race's result sheet
//	onto a page canvas from the merged rows of /api/result-data.

import { Drawer, PageCanvas } from '/apps/shared/drawlib.js'
import {
	AsStr
,	AsInt
,	TD
,	PH
,	Tenko
,	BabaT
,	BabaD
,	JyoCD2Str
,	Title_Jyoken
,	Course
,	CalcRacePace
,	JyokenInfo_SyubetuCD_Hondai
,	ReplaceNum
} from '/apps/shared/deumacodes.js'

const
{ sIPAG, sIPAM, sRyuminL } = Drawer

const
WIDTH = [
	10		//	 0 着順
,	10		//	 1 枠番
,	10		//	 2 馬番
,	10		//	 3 ブリンカー
,	80		//	 4 馬名
,	30		//	 5 斤量
,	40		//	 6 騎手
,	30		//	 7 タイム
,	40		//	 8 着差
,	20		//	 9 テン
,	10		//	10 内外
,	30		//	11 上３F
,	20		//	12 馬体重
,	10		//	13 人気
,	40		//	14 通過順
,	50		//	15 戦評
,	20		//	16 戦評コード
,	20		//	17 金額
,	20		//	18 入選
,	20		//	19 着差２
]

const
StartPos = no => WIDTH.slice( 0, Math.min( no, WIDTH.length ) ).reduce( ( a, b ) => a + b, 0 )

const
TotalWidth = () => StartPos( WIDTH.length )

const
CenterPos = ( no, endno ) => endno === undefined
?	StartPos( no ) + WIDTH[ no ] / 2
:	( StartPos( no ) + StartPos( endno ) ) / 2

//	NNN -> NN.N
const
IntToNNCNString = n => `${ Math.floor( n / 10 ) }.${ n % 10 }`

//	NNNN -> N.NN.N
const
NNNConvNCNNCN = n => {
	const
	w = Math.floor( ( n % 1000 ) / 10 )
	return `${ Math.floor( n / 1000 ) }.${ w < 10 ? '0' + w : w }.${ n % 10 }`
}

const
CHAKUSA = {
	'12': '1/2', '34': '3/4', '14': '1/4'
,	'1': '１', '112': '１1/2', '114': '１1/4', '134': '１3/4'
,	'2': '２', '212': '２1/2', '214': '２1/4'
,	'3': '３', '312': '３1/2'
,	'4': '４', '5': '５', '6': '６', '7': '７', '8': '８', '9': '９', '734': '７3/4'
,	'A': 'アタマ', 'D': '同着', 'H': 'ハナ', 'K': 'クビ', 'T': '大差', 'Z': '１０'
}

export class
ResultDrawer extends Drawer {

	//	rows: merged /api/result-data rows; pace: { nikaku, mukousyou, sankaku, yonkaku }
	constructor( canvas, rows, pace ) {
		super( canvas )
		this.rows = rows
		this.pace = pace
	}

	static async Render( rows, pace ) {
		const
		canvas = PageCanvas()
		new ResultDrawer( canvas, rows, pace ).ResultPrint()
		return canvas
	}

	IJyoString( p ) {
		switch ( AsInt( p, 'IJyoCD' ) ) {
		case 1:	return '出走取消'
		case 2:	return '発走除外'
		case 3:	return '競走除外'
		case 4:	return AsInt( p, 'STATUS' ) === 8 ? '落馬' : '競走中止'
		case 5:	return '失格'
		case 6:	return '落馬再騎乗'
		case 7:	return '降着'
		default:	return ''
		}
	}

	ResultPrint() {
		const
		rows = this.rows
		this.HTranslate( 20 )
		this.VTranslate( 20 )
		this.g.scale( 1.47, 1.47 )

		this.DrawNichiji( rows[ 0 ] )
		this.VTranslate( 20 )

		this.HLine2( 0, 0, TotalWidth() )
		this.DrawRaceInfo( rows[ 0 ] )
		this.VTranslate( 20 )

		this.HLine2( 0, 0, TotalWidth() )
		this.DrawHeader()
		this.VTranslate( 20 )

		let
		cnt = 0
		for ( const row of rows ) {
			if ( cnt % 5 === 0 ) {
				this.HLine2( 0, 0, TotalWidth() )
				this.VTranslate( 1 )
			}
			cnt++
			this.DrawData( row )
			this.VTranslate( 11 )
		}

		this.VTranslate( 50 )
		this.DrawPace()

		this.VTranslate( 150 )
		for ( const row of rows ) {
			this.DrawComment( row )
			this.VTranslate( 11 )
		}
	}

	DrawNichiji( raceDR ) {
		let
		x = 0
		this.AH( AsStr( raceDR, 'id_Year' ), sIPAG, 10, x, 8 )
		x += 20
		this.ZH( '年', sIPAG, 10, x, 8 )
		x += 10

		const
		m = Math.floor( AsInt( raceDR, 'id_MonthDay' ) / 100 )
		this.AH( String( m ), sIPAG, 10, x, 8 )
		x += m >= 10 ? 10 : 5
		this.ZH( '月', sIPAG, 10, x, 8 )
		x += 10

		const
		d = AsInt( raceDR, 'id_MonthDay' ) % 100
		this.AH( String( d ), sIPAG, 10, x, 8 )
		x += d >= 10 ? 10 : 5
		this.ZH( '日', sIPAG, 10, x, 8 )

		this.CenterH( this.GetTitle(), sRyuminL, 12, CenterPos( 5, 13 ), 10 )

		this.ZH( this.U100( AsInt( raceDR, 'id_RaceNum' ) ) + 'レース', sRyuminL, 10, StartPos( 16 ), 8 )
	}

	DrawRaceInfo( raceDR ) {
		this.ZH( this.U100( AsInt( raceDR, 'id_Kaiji' ) ) + '回' + JyoCD2Str( AsStr( raceDR, 'id_JyoCD' ) ), sRyuminL, 10, StartPos( 0 ), 5 )
		this.ZH( this.U100( AsInt( raceDR, 'id_Nichiji' ) ) + '日目', sRyuminL, 10, StartPos( 4 ), 5 )

		let
		tenko = Tenko( raceDR ) + '・'
		tenko += ( TD( raceDR ) === '芝' ? BabaT( raceDR ) : BabaD( raceDR ) ).substring( 0, 1 )
		this.ZH( tenko, sRyuminL, 10, StartPos( 4 ) + 30, 5 )

		this.CenterH( Title_Jyoken( raceDR ), sRyuminL, 12, CenterPos( 5, 13 ), 10 )
		this.ZH( Course( raceDR ), sRyuminL, 8, StartPos( 14 ), 7 )
		this.AH( AsStr( raceDR, 'Kyori' ) + 'm', sRyuminL, 10, StartPos( 16 ), 5 )
		this.ZH( this.U100( AsInt( raceDR, 'SyussoTosu' ) ) + '頭', sRyuminL, 10, StartPos( 18 ), 5 )
	}

	DrawHeader() {
		const
		y1 = 10, y2 = 5, y3 = 2
		this.CenterV( '着順', sRyuminL, 6, CenterPos( 0 ), y1 )
		this.CenterV( '枠番', sRyuminL, 6, CenterPos( 1 ), y1 )
		this.CenterV( '馬番', sRyuminL, 6, CenterPos( 2 ), y1 )
		this.ZH( '馬名', sRyuminL, 10, StartPos( 4 ), y2 )
		this.CenterH( '斤量', sRyuminL, 10, CenterPos( 5 ), y1 )
		this.ZH( '騎手', sRyuminL, 10, StartPos( 6 ), y2 )
		this.CenterH( 'タイム', sRyuminL, 10, CenterPos( 7 ), y1 )
		this.CenterH( '着差', sRyuminL, 10, CenterPos( 8 ), y1 )
		this.CenterH( 'テン', sRyuminL, 10, CenterPos( 9 ), y1 )
		this.CenterV( '内外', sRyuminL, 6, CenterPos( 10 ), y1 )
		this.CenterH( '上３Ｆ', sRyuminL, 10, CenterPos( 11 ), y1 )
		this.ZH( '馬', sRyuminL, 6, StartPos( 12 ), y3 )
		this.ZH( '体', sRyuminL, 6, StartPos( 12 ) + 7, y3 + 5 )
		this.ZH( '重', sRyuminL, 6, StartPos( 12 ) + 14, y3 + 10 )
		this.CenterV( '人気', sRyuminL, 6, CenterPos( 13 ), y1 )
		this.CenterH( '通過順', sRyuminL, 10, CenterPos( 14 ), y1 )
		this.CenterH( '戦評', sRyuminL, 10, CenterPos( 15 ), y1 )
		this.ZH( 'コ', sRyuminL, 6, StartPos( 16 ), y3 )
		this.ZH( 'ー', sRyuminL, 6, StartPos( 16 ) + 7, y3 + 5 )
		this.ZH( 'ド', sRyuminL, 6, StartPos( 16 ) + 14, y3 + 10 )
		this.CenterH( '金額', sRyuminL, 10, CenterPos( 17 ), y1 )
		this.CenterV( '入線', sRyuminL, 6, CenterPos( 18 ), y1 )
	}

	DrawData( p ) {
		const
		juni = AsInt( p, 'KakuteiJyuni' )
		if ( juni > 0 ) this.FitZH( this.U100( juni ), sIPAG, 8, StartPos( 0 ), 1, WIDTH[ 0 ] )

		this.FitZH( this.U100( AsInt( p, 'Wakuban' ) ), sIPAM, 8, StartPos( 1 ), 1, WIDTH[ 1 ] )
		this.ZH( this.NumberCircle( AsInt( p, 'Umaban' ) ), sIPAM, 8, StartPos( 2 ), 1 )

		if ( AsInt( p, 'Blinker' ) === 1 ) this.FitZH( 'B', sIPAM, 8, StartPos( 3 ), 1, WIDTH[ 3 ] )

		this.ZH( AsStr( p, 'Bamei' ), sIPAM, 8, StartPos( 4 ), 1 )

		const
		kinryo = AsInt( p, 'Futan' )
		this.CenterH( kinryo % 10 === 0 ? String( kinryo / 10 ) : String( kinryo / 10.0 ), sIPAM, 8, CenterPos( 5 ), 5 )

		this.ZH( AsStr( p, 'KisyuRyakusyo' ), sIPAM, 8, StartPos( 6 ), 1 )

		const
		time = AsInt( p, 'Time' )
		juni > 0
		?	this.CenterH( NNNConvNCNNCN( time ), sIPAM, 8, CenterPos( 7 ), 5 )
		:	this.CenterH( this.IJyoString( p ), sIPAG, 8, CenterPos( 7 ), 5 )

		let
		chakusa = CHAKUSA[ AsStr( p, 'ChakusaCD' ) ] ?? ''
		if ( !chakusa && juni > 0 ) {
			switch ( AsInt( p, 'RecordUpKubun' ) ) {
			case 1:	chakusa = '基準';	break
			case 2:	chakusa = 'レコード';	break
			}
		}
		this.CenterH( chakusa, sIPAM, 8, CenterPos( 8 ), 5 )

		let
		agari3f = 0
		switch ( PH( p ) ) {
		case 1:	agari3f = AsInt( p, 'HTL3' );	break
		case 2:	agari3f = AsInt( p, 'LAST3F' );	break
		}
		this.CenterH( 0 < agari3f && agari3f < 999 ? IntToNNCNString( agari3f ) : String( agari3f ), sIPAM, 8, CenterPos( 11 ), 5 )

		if ( PH( p ) === 1 ) {
			let
			ten = AsInt( p, 'START3F' )
			if ( ten === 0 ) {
				const
				straight = [ '10', '29' ].includes( AsStr( p, 'TrackCD' ) )
			,	kyori = AsInt( p, 'Kyori' )
				if ( straight || kyori === 1200 ) {
					const
					deci = Math.floor( time / 1000 ) * 600 + time % 1000
					ten = deci - agari3f
				}
			}
			if ( 0 < ten ) this.CenterH( IntToNNCNString( ten ), sIPAG, 9, CenterPos( 9 ), 5 )
			const
			naigai = { 1: '内', 2: '中', 3: '外' }[ AsInt( p, 'C4_ICHIDORI' ) ] ?? '―'
			this.CenterH( naigai, sIPAG, 9, CenterPos( 10 ), 5 )
		}

		this.CenterH( AsStr( p, 'BaTaijyu' ), sIPAM, 8, CenterPos( 12 ), 5 )

		const
		ninki = AsInt( p, 'Ninki' )
		if ( ninki > 0 ) this.CenterH( this.NumberCircle( ninki ), sIPAM, 8, CenterPos( 13 ), 5 )

		const
		TsukaStr = n => n < 0 ? this.CtoS( 0x2473 - n ) : n > 0 ? this.CtoS( 0x245f + n ) : ''
		let
		tuka = ''
		switch ( PH( p ) ) {
		case 1: {
			let
			wC2 = AsInt( p, 'Jyuni2c' ); if ( wC2 === 0 ) wC2 = AsInt( p, 'BS_JUNI' ); if ( AsInt( p, 'BS_FURI' ) !== 0 ) wC2 = -wC2
			let
			wC3 = AsInt( p, 'Jyuni3c' ); if ( wC3 === 0 ) wC3 = AsInt( p, 'C3_JUNI' ); if ( AsInt( p, 'C3_FURI' ) !== 0 ) wC3 = -wC3
			let
			wC4 = AsInt( p, 'Jyuni4c' ); if ( wC4 === 0 ) wC4 = AsInt( p, 'C4_JUNI' ); if ( AsInt( p, 'C4_FURI' ) !== 0 ) wC4 = -wC4
			tuka = '　' + TsukaStr( wC2 ) + TsukaStr( wC3 ) + TsukaStr( wC4 )
			break
		}
		case 2: {
			let
			wC1 = AsInt( p, 'C2_JUNI' ); if ( AsInt( p, 'C2_FURI' ) !== 0 ) wC1 = -wC1
			let
			wC2 = AsInt( p, 'BS_JUNI' ); if ( AsInt( p, 'BS_FURI' ) !== 0 ) wC2 = -wC2
			let
			wC3 = AsInt( p, 'C3_JUNI' ); if ( AsInt( p, 'C3_FURI' ) !== 0 ) wC3 = -wC3
			let
			wC4 = AsInt( p, 'C4_JUNI' ); if ( AsInt( p, 'C4_FURI' ) !== 0 ) wC4 = -wC4
			tuka = TsukaStr( wC1 ) + TsukaStr( wC2 ) + TsukaStr( wC3 ) + TsukaStr( wC4 )
			break
		}
		}
		this.ZH( tuka, sIPAG, 9, CenterPos( 14 ) - 18, 1 )

		const
		senpyo = AsStr( p, 'COMMENT' )
		this.CenterH( senpyo, sIPAG, 9, CenterPos( 15 ), 5 )
		this.CenterH( AsStr( p, 'SENPYO_CD' ), sIPAM, 8, CenterPos( 16 ), 5 )

		let
		kingaku = ''
		if ( AsInt( p, 'Honsyokin' ) !== 0 ) kingaku = String( Math.floor( AsInt( p, 'Honsyokin' ) / 100 ) )
		this.AHR( kingaku, sIPAM, 8, StartPos( 17 ) + WIDTH[ 17 ], 1 )

		if ( juni > 0 ) this.CenterH( this.U100( AsInt( p, 'NyusenJyuni' ) ), sIPAM, 8, CenterPos( 18 ), 5 )

		let
		sa0 = this.U100( AsInt( p, 'DIFF0' ) )
		if ( sa0 === this.U100( 0 ) ) sa0 = ''
		const
		sa1 = { 1: '⒡', 2: '⒢', 3: '⒠', 4: '⒤', 5: '⒣', 14: '⒜', 12: '⒝', 34: '⒞' }[ AsInt( p, 'DIFF1' ) ] ?? ''
		sa1 === ''
		?	this.ZH( sa0, sIPAM, 8, StartPos( 19 ) + 8, 1 )
		:	this.ZH( sa0, sIPAM, 8, StartPos( 19 ), 1 )
		;[ '⒣', '⒠', '⒡', '⒢' ].includes( sa1 )
		?	this.ZH( sa1, sIPAM, 8, StartPos( 19 ), 1 )
		:	this.ZH( sa1, sIPAM, 8, StartPos( 19 ) + 8, 1 )
	}

	DrawPace() {
		const
		rows = this.rows
	,	first = rows[ 0 ]
		if ( PH( first ) === 1 ) {
			let
			pace = ''
			switch ( AsInt( first, 'PACE' ) ) {
			case 0:	pace = 'ペース（' + CalcRacePace( first ) + '）';	break
			case 1:	pace = 'ペース（Ｓ）';	break
			case 2:	pace = 'ペース（Ｍ）';	break
			case 3:	pace = 'ペース（Ｈ）';	break
			}
			this.ZH( pace, sIPAM, 10, 0, 0 )

			this.ZH( 'ラップタイム', sIPAM, 10, 0, 10 )
			let
			rap = ''
			for ( let i = 0; i < 25; i++ ) {
				const
				time = AsInt( first, `LapTime_${ i }` )
				if ( time === 0 ) break
				if ( i !== 0 ) rap += '-'
				rap += IntToNNCNString( time )
			}
			this.AH( rap, sIPAM, 10, 60, 10 )
		}

		this.ZH( '二　角', sIPAM, 10, 0, 20 )
		this.ZH( '向正面', sIPAM, 10, 0, 30 )
		this.ZH( '三　角', sIPAM, 10, 0, 40 )
		this.ZH( '四　角', sIPAM, 10, 0, 50 )
		switch ( PH( first ) ) {
		case 1:
			this.AH( this.pace.mukousyou, sIPAG, 10, 30, 30 )
			this.AH( this.pace.sankaku, sIPAG, 10, 30, 40 )
			this.AH( this.pace.yonkaku, sIPAG, 10, 30, 50 )
			break
		case 2:
			this.AH( this.pace.nikaku, sIPAG, 10, 30, 20 )
			this.AH( this.pace.mukousyou, sIPAG, 10, 30, 30 )
			this.AH( this.pace.sankaku, sIPAG, 10, 30, 40 )
			this.AH( this.pace.yonkaku, sIPAG, 10, 30, 50 )
			break
		}

		this.ZH( '脚　質', sIPAM, 10, 0, 60 )
		{
			let
			x = 30
			for ( let i = 0; i < rows.length; i++ ) {
				const
				w = AsInt( rows[ i ], 'KakuteiJyuni' )
				if ( w === 1 ) { this.ZH( '１着馬' + this.GetKyakusitu( i ), sIPAG, 10, x, 60 ); x += 70 }
				if ( w === 2 ) { this.ZH( '２着馬' + this.GetKyakusitu( i ), sIPAG, 10, x, 60 ); x += 70 }
			}
		}

		let
		y = 70
		this.ZH( '記　事', sIPAM, 10, 0, y )
		const
		kiji = []
	,	blinker = this.GetKijiUmaban( 'Blinker' )
	,	furi1 = this.GetKijiUmaban( 'C1_FURI' )
	,	furi2 = this.GetKijiUmaban( 'C2_FURI' )
	,	furiBS = this.GetKijiUmaban( 'BS_FURI' )
	,	furi3 = this.GetKijiUmaban( 'C3_FURI' )
	,	furi4 = this.GetKijiUmaban( 'C4_FURI' )
		if ( blinker !== '' )	kiji.push( blinker + 'ブリンカー着用' )
		if ( furi1 !== '' )		kiji.push( furi1 + '一角で不利有り' )
		if ( furi2 !== '' )		kiji.push( furi2 + '二角で不利有り' )
		if ( furiBS !== '' )	kiji.push( furiBS + '向正面で不利有り' )
		if ( furi3 !== '' )		kiji.push( furi3 + '三角で不利有り' )
		if ( furi4 !== '' )		kiji.push( furi4 + '四角で不利有り' )

		for ( const e of kiji ) {
			this.ZH( e, sIPAG, 10, 30, y )
			y += 10
		}

		for ( const w of rows ) {
			if ( AsInt( w, 'IJyoCD' ) !== 0 ) {
				this.ZH(
					this.NumberCircle( AsInt( w, 'Umaban' ) ) + AsStr( w, 'FUKA1' ).replaceAll( '　', '' ) + '　' + this.IJyoString( w )
				,	sIPAG, 10, 30, y
				)
				y += 10
			}
		}
	}

	GetKyakusitu( n ) {
		let
		asi = this.NumberCircle( AsInt( this.rows[ n ], 'Umaban' ) )
		switch ( AsInt( this.rows[ n ], 'KIMARITE' ) ) {
		case 1:	asi += '逃げ';	break
		case 2:	asi += '先行';	break
		case 3:	asi += '差し';	break
		case 4:	asi += '追込';	break
		}
		return asi
	}

	GetKijiUmaban( col ) {
		const
		w = this.rows.filter( e => AsInt( e, col ) !== 0 ).map( e => AsInt( e, 'Umaban' ) ).sort( ( a, b ) => a - b )
		return w.map( p => this.NumberCircle( p ) ).join( '' )
	}

	DrawComment( row ) {
		const
		juni = AsInt( row, 'KakuteiJyuni' )
		if ( juni > 0 ) this.FitZH( this.NumberCircle( juni ), sIPAG, 10, StartPos( 0 ), 0, 10 )

		this.ZH( AsStr( row, 'Bamei' ), sIPAG, 10, 10, 0 )

		if ( row.NEW_CONDITION || row.NEW_CONTENT2 ) {
			this.ZH( AsStr( row, 'NEW_CONDITION' ), sIPAG, 10, 110, 0 )
			this.ZH( ReplaceNum( AsStr( row, 'NEW_CONTENT2' ) ), sIPAG, 10, 120, 0 )
		}
	}

	GetTitle() {
		const
		first = this.rows[ 0 ]
		let
		title = ''
		const
		wNkai = AsInt( first, 'RaceInfo_Nkai' )
		if ( wNkai !== 0 ) title += '第' + wNkai + '回'
		title += AsStr( first, 'RaceInfo_Hondai' )

		if ( AsStr( first, 'SHORT_NAME' ) !== '' ) title += '（' + AsStr( first, 'SHORT_NAME' ) + '）'

		title += this.GetGrade()

		if ( title === '' ) title = JyokenInfo_SyubetuCD_Hondai( AsInt( first, 'JyokenInfo_SyubetuCD' ) )
		return title
	}

	GetGrade() {
		return {
			'A': '（ＧⅠ）', 'B': '（ＧⅡ）', 'C': '（ＧⅢ）', 'D': '（重賞）'
		,	'F': '（障害ＧⅠ）', 'G': '（障害ＧⅡ）', 'H': '（障害ＧⅢ）'
		,	'L': '（リステッド）', 'X': '（交流ＧⅠ）', 'Y': '（交流ＧⅡ）', 'Z': '（交流ＧⅢ）'
		}[ AsStr( this.rows[ 0 ], 'GradeCD' ) ] ?? ''
	}
}
