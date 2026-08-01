//	gBizINFO 法人情報(Hojinjoho, 都道府県分割JSON配列) を JSONables IndexedCluster 形式へ変換。
//	出力: <out>/hojin.jsons  (1社1行・全項目。詳細表示用)
//	      <out>/hojin.idx    ([ corporate_number, offset, len ] / 行)
//	      <out>/hojin.meta.json
//	      <out>/hojin.search.jsons ([ 法人番号, 名称, カナ, 都道府県, 住所 ] / 行 — 名称検索用の軽量索引)
//	      <out>/kihon.{jsons,idx,meta.json}
//	         基本情報だけを抜いた軽量テーブル(全体の約4%)。hojin は1社に特許数万件を
//	         抱えて5.4GBあり、SQLの全走査に20秒かかるため、集計・検索用に分けている。
//	使い方: node --max-old-space-size=4096 tools/build-gbiz.js [srcDir] [outDir]

import fs	from 'fs'
import path	from 'path'

const
SRC = process.argv[ 2 ] || '/Users/s/Desktop/JSONables/gBizINFO/Hojinjoho_20260727'
,	OUT = process.argv[ 3 ] || '/Users/s/Desktop/JSONables/data/gbiz'

fs.mkdirSync( OUT, { recursive: true } )

//	日本標準産業分類 大分類（apps/gbiz/main.js の JSIC と同じ）
const
JSIC = {
	A: '農業，林業', B: '漁業', C: '鉱業，採石業，砂利採取業', D: '建設業', E: '製造業'
,	F: '電気・ガス・熱供給・水道業', G: '情報通信業', H: '運輸業，郵便業', I: '卸売業，小売業'
,	J: '金融業，保険業', K: '不動産業，物品賃貸業', L: '学術研究，専門・技術サービス業'
,	M: '宿泊業，飲食サービス業', N: '生活関連サービス業，娯楽業', O: '教育，学習支援業'
,	P: '医療，福祉', Q: '複合サービス事業', R: 'サービス業（他に分類されないもの）'
,	S: '公務（他に分類されるものを除く）', T: '分類不能の産業'
}

const
KIND = {
	'101': '国の機関', '201': '地方公共団体'
,	'301': '株式会社', '302': '有限会社', '303': '合名会社', '304': '合資会社', '305': '合同会社'
,	'399': 'その他の設立登記法人', '401': '外国会社等', '499': 'その他'
}

//	list の要素は文字列 or { code/name } — 表記ゆれを吸収して素の値の配列に
const
Values = list => Array.isArray( list )
	? [ ...new Set( list.map( x => typeof x === 'object' && x
		? String( x.code ?? x.name ?? Object.values( x ).find( Boolean ) ?? '' )
		: String( x ?? '' )
	).filter( Boolean ) ) ]
	: []

const
jsonsFd	= fs.openSync( path.join( OUT, 'hojin.jsons' ), 'w' )
,	idxFd		= fs.openSync( path.join( OUT, 'hojin.idx' ), 'w' )
,	searchFd	= fs.openSync( path.join( OUT, 'hojin.search.jsons' ), 'w' )
,	kihonFd		= fs.openSync( path.join( OUT, 'kihon.jsons' ), 'w' )
,	kihonIdxFd	= fs.openSync( path.join( OUT, 'kihon.idx' ), 'w' )

let
kihonOffset = 0

let
offset = 0
,	count = 0

const
files = fs.readdirSync( SRC ).filter( f => f.endsWith( '.json' ) ).sort()

for ( const f of files ) {
	const
	arr = JSON.parse( fs.readFileSync( path.join( SRC, f ), 'utf8' ) )
	let
	chunk = ''
	,	idxChunk = ''
	,	searchChunk = ''
	,	kihonChunk = ''
	,	kihonIdxChunk = ''
	for ( const c of arr ) {
		const
		key		= String( c.corporate_number )
		,	line	= JSON.stringify( c )
		,	len		= Buffer.byteLength( line, 'utf8' )
		,	loc		= String( c.location ?? '' )
			//	/^(.+?[都道府県])/ だと「京都府」が「京都」で止まる（京の次が都）ので明示的に並べる
		,	pref	= ( loc.match( /^(北海道|東京都|(?:京都|大阪)府|.{2,4}?県)/ ) || [ , '' ] )[ 1 ]
		chunk		+= line + '\n'
		idxChunk	+= JSON.stringify( [ key, offset, len ] ) + '\n'
		searchChunk	+= JSON.stringify( [ key, String( c.name ?? '' ).trim(), String( c.kana ?? '' ).trim(), pref, loc ] ) + '\n'
		offset		+= len + 1
		count++

		//	軽量テーブル: 配列(subsidy/procurement/patent/…)とmeta-dataを落とし、
		//	SQLで扱いやすいよう業種・法人種別の名称と都道府県を持たせる。
		const
		industry	= Values( c.industry )
		,	kihon	= {
			corporate_number	: key
		,	name				: String( c.name ?? '' ).trim()
		,	kana				: String( c.kana ?? '' ).trim()
		,	name_en				: c.name_en ?? null
		,	pref				: pref || null
		,	location			: loc || null
		,	postal_code			: c.postal_code ?? null
		,	kind				: c.kind ?? null
		,	kind_name			: KIND[ String( c.kind ) ] ?? null
		,	status				: c.status ?? null
		,	close_date			: c.close_date ?? null
		,	close_cause			: c.close_cause ?? null
		,	representative_name	: c.representative_name ?? null
		,	capital_stock		: c.capital_stock ?? null
		,	employee_number		: c.employee_number ?? null
		,	company_size_male	: c.company_size_male ?? null
		,	company_size_female	: c.company_size_female ?? null
		,	business_summary	: c.business_summary ?? null
		,	company_url			: c.company_url ?? null
		,	founding_year		: c.founding_year ?? null
		,	date_of_establishment: c.date_of_establishment ?? null
		,	industry			: industry.join( ',' ) || null
		,	industry_name		: industry.map( code => JSIC[ code ] ?? code ).join( ',' ) || null
		,	business_items		: Values( c.business_items ).join( ',' ) || null
		,	qualification_grade	: c.qualification_grade ?? null
		,	update_date			: c.update_date ?? null
			//	件数だけ持たせておくと「特許の多い会社」等がSQLで引ける
		,	subsidy_count		: ( c.subsidy ?? [] ).length
		,	procurement_count	: ( c.procurement ?? [] ).length
		,	patent_count		: ( c.patent ?? [] ).length
		,	commendation_count	: ( c.commendation ?? [] ).length
		}
		,	kihonLine	= JSON.stringify( kihon )
		,	kihonLen	= Buffer.byteLength( kihonLine, 'utf8' )
		kihonChunk		+= kihonLine + '\n'
		kihonIdxChunk	+= JSON.stringify( [ key, kihonOffset, kihonLen ] ) + '\n'
		kihonOffset		+= kihonLen + 1
	}
	fs.writeSync( jsonsFd, Buffer.from( chunk, 'utf8' ) )
	fs.writeSync( idxFd, idxChunk )
	fs.writeSync( searchFd, searchChunk )
	fs.writeSync( kihonFd, Buffer.from( kihonChunk, 'utf8' ) )
	fs.writeSync( kihonIdxFd, kihonIdxChunk )
	process.stderr.write( `${ f }: total ${ count }\n` )
}

for ( const table of [ 'hojin', 'kihon' ] ) fs.writeFileSync(
	path.join( OUT, `${ table }.meta.json` )
,	JSON.stringify( { style: 'full', keyFields: [ 'corporate_number' ] }, null, '\t' ) + '\n'
)

fs.closeSync( jsonsFd )
fs.closeSync( idxFd )
fs.closeSync( searchFd )
fs.closeSync( kihonFd )
fs.closeSync( kihonIdxFd )

console.error( `done: ${ count } companies, hojin ${ offset } bytes, kihon ${ kihonOffset } bytes` )
