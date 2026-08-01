//	gBizINFO 法人検索・財務 API。
//	名称検索: hojin.search.jsons(起動時にRAM)。会社詳細: 汎用 GET /db/gbiz/hojin/{法人番号}。
//	財務: 生データ gBizINFO/Zaimujoho_UTF-8.csv(年度別財務) と gBizINFO/Kessanjoho_*/(決算公告XML)
//	      を法人番号で索引し GET /api/gbiz/finance?num= で返す。

import fs		from 'fs'
import path	from 'path'
import url		from 'url'

import {
	SendJSONable
,	QueryOf
} from '../SAT/Bullet.js'

const
ROOT		= path.resolve( path.dirname( url.fileURLToPath( import.meta.url ) ), '..' )
,	GBIZ_SRC	= path.join( ROOT, 'gBizINFO' )
,	SEARCH_PATH	= path.join( ROOT, 'data', 'gbiz', 'hojin.search.jsons' )

//	[ 法人番号, 名称, カナ, 都道府県, 住所 ]（約45万件, ~70MB）
const
LoadSearchIndex = () => {
	if ( !fs.existsSync( SEARCH_PATH ) ) return []
	const
	rows = []
	for ( const line of fs.readFileSync( SEARCH_PATH, 'utf8' ).split( '\n' ) ) if ( line ) rows.push( JSON.parse( line ) )
	return rows
}

///////////////////////////////	財務: Zaimujoho CSV

//	素朴だが堅牢なCSVパーサ（"" エスケープ・引用符内カンマ/改行対応）
const
ParseCSV = text => {
	const
	rows = []
	let
	row = [], field = '', inQuote = false
	for ( let i = 0; i < text.length; i++ ) {
		const c = text[ i ]
		if ( inQuote ) {
			if ( c === '"' ) { if ( text[ i + 1 ] === '"' ) { field += '"' ; i++ } else inQuote = false }
			else field += c
		} else if ( c === '"' ) inQuote = true
		else if ( c === ',' ) { row.push( field ) ; field = '' }
		else if ( c === '\n' ) { row.push( field ) ; rows.push( row ) ; row = [] ; field = '' }
		else if ( c !== '\r' ) field += c
	}
	if ( field.length || row.length ) { row.push( field ) ; rows.push( row ) }
	return rows
}

//	法人番号 → 年度別財務レコード配列
const
LoadZaimu = () => {
	const
	file = path.join( GBIZ_SRC, 'Zaimujoho_UTF-8.csv' )
	if ( !fs.existsSync( file ) ) return new Map()
	const
	text = fs.readFileSync( file, 'utf8' ).replace( /^﻿/, '' )
	,	rows = ParseCSV( text )
	,	header = rows.shift() ?? []
	,	col = name => header.indexOf( name )
	,	iNum	= col( '法人番号' )
	,	iYear	= col( '事業年度' )
	,	iKaiji	= col( '回次' )
	,	iKijun	= col( '会計基準' )
	,	iKeijo	= col( '経常利益又は経常損失（△）' )
	,	iJun	= col( '当期純利益又は当期純損失（△）' )
	,	iShihon	= col( '資本金' )
	,	iJunS	= col( '純資産額' )
	,	iSouS	= col( '総資産額' )
	,	iEmp	= col( '従業員数' )
		//	収益の科目は業態で異なる（事業会社=売上高, 鉄道/不動産=営業収益, 銀行=経常収益, 保険=正味収入保険料…）
	,	REVENUE	= [ '売上高', '営業収益', '営業収入', '営業総収入', '経常収益', '正味収入保険料' ].map( name => [ name, col( name ) ] )
	,	map = new Map()
	for ( const r of rows ) {
		const
		num = r[ iNum ]
		if ( !num ) continue
		const
		holders = []
		for ( let n = 1; n <= 5; n++ ) {
			const
			h = r[ col( `大株主${ n }` ) ]
			,	ratio = r[ col( `発行済株式総数に対する所有株式数の割合${ n }` ) ]
			if ( h ) holders.push( { name: h, ratio } )
		}
		const
		revenue = REVENUE.find( ( [ , i ] ) => i >= 0 && r[ i ] )
		;( map.get( num ) ?? map.set( num, [] ).get( num ) ).push( {
			year: r[ iYear ], kaiji: r[ iKaiji ], kijun: r[ iKijun ]
		,	revenueLabel: revenue ? revenue[ 0 ] : '売上高'
		,	revenue: revenue ? r[ revenue[ 1 ] ] : ''
		,	keijo: r[ iKeijo ], jun: r[ iJun ]
		,	shihon: r[ iShihon ], junshisan: r[ iJunS ], soshisan: r[ iSouS ], employee: r[ iEmp ]
		,	holders
		} )
	}
	//	回次 0=当期, 1=1期前 … 4=4期前（EDINET有報の「経営指標等の推移」5期分）
	for ( const list of map.values() ) list.sort( ( a, b ) => Number( a.kaiji ) - Number( b.kaiji ) )
	return map
}

///////////////////////////////	財務: Kessanjoho 決算公告XML

//	法人番号 → XMLファイルパス配列（ファイル名先頭が法人番号）
const
LoadKessanIndex = () => {
	const
	dir = fs.existsSync( GBIZ_SRC )
		? fs.readdirSync( GBIZ_SRC ).find( d => /^Kessanjoho_/.test( d ) && fs.statSync( path.join( GBIZ_SRC, d ) ).isDirectory() )
		: null
	const
	map = new Map()
	if ( !dir ) return { dir: null, map }
	const
	base = path.join( GBIZ_SRC, dir )
	for ( const f of fs.readdirSync( base ) ) {
		if ( !f.endsWith( '.xml' ) ) continue
		const
		num = f.split( '_' )[ 0 ]
		;( map.get( num ) ?? map.set( num, [] ).get( num ) ).push( f )
	}
	return { dir: base, map }
}

//	決算公告XML → { period, release, unit, tables:[ { name, date, rows:[ {subject,amount} ] } ] }
const
ParseKessan = xml => {
	const
	pick = re => ( xml.match( re ) || [ , '' ] )[ 1 ].trim()
	,	tables = []
	,	reportRe = /<ReportName[^>]*表名="([^"]*)"[^>]*>([\s\S]*?)(?=<ReportName|<\/Report>|$)/g
	let
	m
	while ( ( m = reportRe.exec( xml ) ) ) {
		const
		body = m[ 2 ]
		,	date = ( body.match( /日付="([^"]*)"/ ) || [ , '' ] )[ 1 ]
		,	meRows = []
		,	meRe = /<Subject>([\s\S]*?)<\/Subject>\s*<Amount>([\s\S]*?)<\/Amount>/g
		let
		mm
		while ( ( mm = meRe.exec( body ) ) ) meRows.push( { subject: mm[ 1 ].trim(), amount: mm[ 2 ].trim() } )
		tables.push( { name: m[ 1 ], date, rows: meRows } )
	}
	return {
		period	: pick( /<Period>([\s\S]*?)<\/Period>/ )
	,	release	: pick( /<Release>([\s\S]*?)<\/Release>/ )
	,	unit	: pick( /<Unit>([\s\S]*?)<\/Unit>/ )
	,	tables
	}
}

///////////////////////////////	routes

export const
GBizRoutes = _clusters => {
	const
	rows		= LoadSearchIndex()
	,	zaimu		= LoadZaimu()
	,	kessan		= LoadKessanIndex()
	console.log( `gbiz: ${ rows.length } companies / zaimu ${ zaimu.size } / kessan ${ kessan.map.size }` )

	return {
		//	GET /api/gbiz/search?q=&pref=&limit=
		'/api/gbiz/search': async ( Q, S ) => {
			const
			query	= QueryOf( Q )
			,	text	= String( query.get( 'q' ) ?? '' ).trim()
			,	pref	= String( query.get( 'pref' ) ?? '' ).trim()
			,	limit	= query.has( 'limit' ) ? Math.max( 1, Number( query.get( 'limit' ) ) ) : 50
			,	digits	= text.replace( /[^0-9]/g, '' )
			,	byNum	= digits.length >= 4
			,	out		= []
			let
			matched = 0
			for ( const row of rows ) {
				if ( pref && row[ 3 ] !== pref ) continue
				const
				hit = !text || ( byNum && row[ 0 ].includes( digits ) ) || row[ 1 ].includes( text ) || row[ 2 ].includes( text )
				if ( !hit ) continue
				matched++
				if ( out.length < limit ) out.push( { corporate_number: row[ 0 ], name: row[ 1 ], kana: row[ 2 ], pref: row[ 3 ], location: row[ 4 ] } )
			}
			SendJSONable( S, { matched, capped: matched > out.length, rows: out } )
		}

	,	'/api/gbiz/prefs': async ( _Q, S ) => {
			const
			set = new Set()
			for ( const row of rows ) if ( row[ 3 ] ) set.add( row[ 3 ] )
			SendJSONable( S, [ ...set ].sort() )
		}

		//	GET /api/gbiz/finance?num={法人番号}
	,	'/api/gbiz/finance': async ( Q, S ) => {
			const
			num = String( QueryOf( Q ).get( 'num' ) ?? '' ).trim()
			,	kessanFiles = kessan.map.get( num ) ?? []
			,	kessanOut = []
			for ( const f of kessanFiles ) {
				try { kessanOut.push( ParseKessan( fs.readFileSync( path.join( kessan.dir, f ), 'utf8' ) ) ) } catch { /* skip broken */ }
			}
			kessanOut.sort( ( a, b ) => String( b.release ).localeCompare( String( a.release ) ) )
			SendJSONable( S, { zaimu: zaimu.get( num ) ?? [], kessan: kessanOut } )
		}
	}
}
