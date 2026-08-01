//	gBizINFO 法人検索ポータル。
//	名称/法人番号 → /api/gbiz/search、詳細 → /db/gbiz/hojin/{法人番号}。

const
$ = id => document.getElementById( id )

const
GetJSON = async path => {
	const
	response = await fetch( path )
	if ( !response.ok ) throw new Error( `${ response.status } ${ await response.text() }` )
	return response.json()
}

const
Escape = _ => String( _ ?? '' ).replace( /[&<>"]/g, c => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ c ] ) )

//	法人の種類コード（法人番号システム準拠）
const
KIND = {
	'101': '国の機関', '201': '地方公共団体'
,	'301': '株式会社', '302': '有限会社', '303': '合名会社', '304': '合資会社', '305': '合同会社'
,	'399': 'その他の設立登記法人', '401': '外国会社等', '499': 'その他'
}

//	日本標準産業分類 大分類（1文字コード）
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
Industry = list => Array.isArray( list )
	? [ ...new Set( list.map( x => {
		const
		code = typeof x === 'object' && x ? ( x.code ?? x.name ?? Object.values( x ).find( Boolean ) ) : x
		,	c = String( code ?? '' ).trim()
		return c ? ( JSIC[ c ] ? `${ c } ${ JSIC[ c ] }` : c ) : ''
	} ).filter( Boolean ) ) ].join( '、' )
	: Or( list )

const
Yen = n => Number.isFinite( Number( n ) ) && n !== null && n !== '' ? `${ Number( n ).toLocaleString( 'ja-JP' ) } 円` : '—'

//	財務用の金額整形（文字列→カンマ区切り）
const
Money = s => {
	const
	n = Number( String( s ?? '' ).replace( /,/g, '' ) )
	return ( s !== '' && s != null && Number.isFinite( n ) ) ? `${ n.toLocaleString( 'ja-JP' ) } 円` : '—'
}

const
Num = s => {
	const
	n = Number( String( s ?? '' ).replace( /,/g, '' ) )
	return Number.isFinite( n ) ? n.toLocaleString( 'ja-JP' ) : Escape( s )
}

const
Day = _ => {
	const
	s = String( _ ?? '' )
	return s ? s.slice( 0, 10 ) : '—'
}

const
Or = _ => {
	const
	s = String( _ ?? '' ).trim()
	return s && s !== 'None' ? s : '—'
}

//	list[obj] を name 系の読める文字列へ
const
Names = list => Array.isArray( list )
	? list.map( _ => typeof _ === 'object' && _ ? ( _.name ?? _.title ?? Object.values( _ ).find( Boolean ) ?? '' ) : _ ).filter( Boolean ).join( '、' )
	: Or( list )

///////////////////////////////	検索

let
SearchSeq = 0

const
RenderResults = ( data, holder ) => {
	if ( !data.rows.length ) { holder.innerHTML = '<div class="empty">該当なし</div>' ; return }
	holder.innerHTML = data.rows.map( r =>
		`<button class="hit" data-num="${ Escape( r.corporate_number ) }">`
		+ `<b>${ Escape( r.name ) }</b>`
		+ `<span>${ Escape( r.pref ) }　法人番号 ${ Escape( r.corporate_number ) }</span>`
		+ `</button>`
	).join( '' )
	holder.querySelectorAll( '.hit' ).forEach( button =>
		button.addEventListener( 'click', () => {
			for ( const other of holder.querySelectorAll( '.hit.active' ) ) other.classList.remove( 'active' )
			button.classList.add( 'active' )
			OpenCompany( button.dataset.num )
		} )
	)
}

const
Search = async () => {
	const
	seq = ++SearchSeq
	,	q = $( 'q' ).value.trim()
	,	pref = $( 'pref' ).value
	,	holder = $( 'results' )
	if ( !q && !pref ) { holder.innerHTML = '<div class="empty">検索語を入力してください。</div>' ; return }
	$( 'status' ).textContent = '検索中...'
	holder.innerHTML = '<div class="empty">検索中...</div>'
	try {
		const
		data = await GetJSON( `/api/gbiz/search?q=${ encodeURIComponent( q ) }&pref=${ encodeURIComponent( pref ) }&limit=50` )
		if ( seq !== SearchSeq ) return	//	古い検索結果は捨てる
		$( 'status' ).textContent = `${ data.matched }件${ data.capped ? '（上位50件表示）' : '' }`
		RenderResults( data, holder )
	} catch ( e ) {
		if ( seq !== SearchSeq ) return
		$( 'status' ).textContent = ''
		holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

///////////////////////////////	詳細

const
Pairs = pairs => `<div class="pairs">${
	pairs.filter( ( [ , v ] ) => v && v !== '—' ).map( ( [ k, v ] ) =>
		`<div class="pair"><span class="k">${ Escape( k ) }</span><span class="v">${ Escape( v ) }</span></div>`
	).join( '' )
}</div>`

//	折りたたみセクション（基本情報以外はすべてこれ。既定は畳んでおき、財務だけ開く）
const
Fold = ( title, count, inner, open = false ) =>
	`<details class="section"${ open ? ' open' : '' }><summary>${ Escape( title ) }${
		count ? `<span class="cnt">${ count }</span>` : ''
	}</summary><div class="foldbody">${ inner }</div></details>`

//	配列セクションを列定義でテーブル化。件数0なら空文字。
const
Section = ( title, list, columns ) => {
	if ( !Array.isArray( list ) || !list.length ) return ''
	const
	head = columns.map( c => `<th>${ Escape( c.label ) }</th>` ).join( '' )
	,	body = list.map( row =>
		`<tr>${ columns.map( c => `<td>${ Escape( c.get( row ) ) }</td>` ).join( '' ) }</tr>`
	).join( '' )
	return Fold(
		title
	,	list.length
	,	`<div class="tablewrap"><table class="grid"><thead><tr>${ head }</tr></thead><tbody>${ body }</tbody></table></div>`
	)
}

const
Workplace = w => {
	if ( !w ) return ''
	const
	b = w.base_infos ?? {}
	,	f = w.women_activity_infos ?? {}
	,	c = w.compatibility_of_childcare_and_work ?? {}
	,	pairs = [
		[ '平均勤続年数(男)', Or( b.average_continuous_service_years_Male ) ]
	,	[ '平均勤続年数(女)', Or( b.average_continuous_service_years_Female ) ]
	,	[ '平均年齢', Or( b.average_age ) ]
	,	[ '月平均所定外労働時間', Or( b.month_average_predetermined_overtime_hours ) ]
	,	[ '女性労働者割合(%)', Or( f.female_workers_proportion ) ]
	,	[ '管理職の女性割合', f.gender_total_of_manager ? `${ Or( f.female_share_of_manager ) } / ${ Or( f.gender_total_of_manager ) }` : '—' ]
	,	[ '役員の女性割合', f.gender_total_of_officers ? `${ Or( f.female_share_of_officers ) } / ${ Or( f.gender_total_of_officers ) }` : '—' ]
	,	[ '育児休業取得(男)', Or( c.paternity_leave_acquisition_num ) ]
	,	[ '育児休業取得(女)', Or( c.maternity_leave_acquisition_num ) ]
	]
	if ( !pairs.some( ( [ , v ] ) => v && v !== '—' ) ) return ''
	return Fold( '職場情報', 0, Pairs( pairs ) )
}

const
RenderCompany = d => {
	const
	holder = $( 'detail' )
	,	addr = [ d.postal_code ? `〒${ Escape( d.postal_code ) }` : '', Escape( d.location ) ].filter( Boolean ).join( ' ' )
	,	head = `<div class="cohead"><h2>${ Escape( d.name ) }</h2>`
		+ `<div class="sub">${ Escape( d.kana ) }${ d.name_en ? '　/　' + Escape( d.name_en ) : '' }</div></div>`
	,	basic = Pairs( [
		[ '法人番号', d.corporate_number ]
	,	[ '法人種別', KIND[ String( d.kind ) ] ?? Or( d.kind ) ]
	,	[ '所在地', addr ]
	,	[ '代表者', Or( d.representative_name ) ]
	,	[ '資本金', d.capital_stock ? Yen( d.capital_stock ) : '—' ]
	,	[ '従業員数', d.employee_number ? `${ Number( d.employee_number ).toLocaleString( 'ja-JP' ) } 人` : '—' ]
	,	[ '企業規模(男/女)', ( d.company_size_male || d.company_size_female ) ? `${ Or( d.company_size_male ) } / ${ Or( d.company_size_female ) }` : '—' ]
	,	[ '業種', Industry( d.industry ) ]
	,	[ '事業概要', Or( d.business_summary ) ]
	,	[ '設立年月日', Day( d.date_of_establishment ) ]
	,	[ '創業年', Or( d.founding_year ) ]
	,	[ 'Webサイト', Or( d.company_url ) ]
	,	[ '全省庁統一資格', Or( d.qualification_grade ) ]
	,	[ '更新日', Day( d.update_date ) ]
	] )
	,	sections = [
		Section( '補助金', d.subsidy, [
			{ label: '交付日', get: r => Day( r.date_of_approval ) }
		,	{ label: '件名', get: r => Or( r.title ) }
		,	{ label: '金額', get: r => Yen( r.amount ) }
		,	{ label: '対象', get: r => Or( r.target ) }
		,	{ label: '府省', get: r => Names( r.government_departments ) }
		] )
	,	Section( '調達', d.procurement, [
			{ label: '発注日', get: r => Day( r.date_of_order ) }
		,	{ label: '件名', get: r => Or( r.title ) }
		,	{ label: '金額', get: r => Yen( r.amount ) }
		,	{ label: '府省', get: r => Names( r.government_departments ) }
		,	{ label: '備考', get: r => Or( r.note ) }
		] )
	,	Section( '表彰', d.commendation, [
			{ label: '表彰日', get: r => Day( r.date_of_commendation ) }
		,	{ label: '件名', get: r => Or( r.title ) }
		,	{ label: '分野', get: r => Or( r.category ) }
		,	{ label: '対象', get: r => Or( r.target ) }
		,	{ label: '府省', get: r => Names( r.government_departments ) }
		] )
	,	Section( '特許', d.patent, [
			{ label: '種別', get: r => Or( r.patent_type ) }
		,	{ label: '登録番号', get: r => Or( r.registration_number ) }
		,	{ label: '出願日', get: r => Day( r.application_date ) }
		,	{ label: '名称', get: r => Or( r.title ) }
		,	{ label: '分類', get: r => Names( r.classifications ) }
		] )
	,	Workplace( d.workplace_info )
	].join( '' )
	holder.innerHTML = head + `<div class="section basic"><h3>基本情報</h3>${ basic }</div>` + sections
		+ '<div id="finance"><div class="section"><h3>財務</h3><div class="empty">読み込み中...</div></div></div>'
	holder.scrollTop = 0
}

///////////////////////////////	財務（Zaimujoho 年度別財務 / Kessanjoho 決算公告）

///////////////////////////////	推移グラフ（インラインSVG）

//	目盛りは 1/2/5 × 10^n 刻み。0 は必ず domain に含める（損失があるため）。
const
NiceScale = ( values, ticks = 4 ) => {
	const
	max = Math.max( 0, ...values )
	,	min = Math.min( 0, ...values )
	,	span = ( max - min ) || 1
	,	raw = span / ticks
	,	mag = 10 ** Math.floor( Math.log10( raw ) )
	,	step = [ 1, 2, 5, 10 ].find( m => m * mag >= raw ) * mag
	return { lo: Math.floor( min / step ) * step, hi: Math.ceil( max / step ) * step, step }
}

//	dataviz: 単位の違う系列を同じ軸に載せない（dual-axis禁止）ため呼び分ける。
//	色は categorical スロット1〜3固定（blue/orange/aqua・検証済み）。
const
SERIES_COLORS = [ '#2a78d6', '#eb6834', '#1baf7a' ]

let
ChartSeq = 0

//	series: [ { label, values: [ number|null ] } ] / labels: x軸ラベル
const
TrendChart = ( title, unit, labels, series ) => {
	const
	live = series.filter( s => s.values.filter( v => Number.isFinite( v ) ).length >= 2 )
	if ( !live.length || labels.length < 2 ) return ''

	const
	W = 560, H = 232
	,	L = 76, R = 96, T = 16, B = 34	//	右は当期の直接ラベル用に空ける
	,	pw = W - L - R
	,	ph = H - T - B
	,	all = live.flatMap( s => s.values.filter( Number.isFinite ) )
	,	{ lo, hi, step } = NiceScale( all )
	,	X = i => L + ( labels.length === 1 ? pw / 2 : pw * i / ( labels.length - 1 ) )
	,	Y = v => T + ph - ph * ( v - lo ) / ( ( hi - lo ) || 1 )
	,	Tick = v => Math.round( v ).toLocaleString( 'ja-JP' )
	,	id = `chart${ ++ChartSeq }`

	//	グリッド + y軸ラベル（ヘアライン・後退色）
	let
	grid = ''
	for ( let v = lo; v <= hi + step / 2; v += step ) {
		const
		y = Y( v )
		grid += `<line x1="${ L }" y1="${ y }" x2="${ L + pw }" y2="${ y }" stroke="${ v === 0 ? '#c3c2b7' : '#e1e0d9' }" stroke-width="1"/>`
			+ `<text x="${ L - 8 }" y="${ y + 3.5 }" text-anchor="end" class="ax">${ Tick( v ) }</text>`
	}

	const
	xAxis = labels.map( ( label, i ) =>
		`<text x="${ X( i ) }" y="${ T + ph + 20 }" text-anchor="middle" class="ax">${ Escape( label ) }</text>`
	).join( '' )

	//	終点ラベルは近接すると重なるので、上から順に最低間隔をあけて押し下げる
	const
	GAP = 12
	,	ends = live
		.map( ( s, si ) => ( { si, value: s.values[ s.values.length - 1 ] } ) )
		.filter( e => Number.isFinite( e.value ) )
		.sort( ( a, b ) => Y( a.value ) - Y( b.value ) )	//	画面上から順に（yが小さい順）
	let
	prevY = -Infinity
	for ( const e of ends ) {
		e.y = Math.max( Y( e.value ), prevY + GAP )
		prevY = e.y
	}
	const
	endY = Object.fromEntries( ends.map( e => [ e.si, e.y ] ) )

	//	線は2px・マーカーは径8px＋2pxの地色リング。終点(当期)だけ直接ラベル。
	const
	marks = live.map( ( s, si ) => {
		const
		color = SERIES_COLORS[ si % SERIES_COLORS.length ]
		,	pts = s.values.map( ( v, i ) => Number.isFinite( v ) ? [ X( i ), Y( v ) ] : null ).filter( Boolean )
		,	path = pts.map( ( [ x, y ], i ) => `${ i ? 'L' : 'M' }${ x.toFixed( 1 ) },${ y.toFixed( 1 ) }` ).join( ' ' )
		,	last = s.values.length - 1
		,	lastVal = s.values[ last ]
		return `<path d="${ path }" fill="none" stroke="${ color }" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
			+ pts.map( ( [ x, y ] ) => `<circle cx="${ x.toFixed( 1 ) }" cy="${ y.toFixed( 1 ) }" r="4" fill="${ color }" stroke="#fff" stroke-width="2"/>` ).join( '' )
			//	ラベル本文はテキスト色のまま。識別は横に置く色マーク（引き出し線）が担う。
			+ ( Number.isFinite( lastVal )
				? `<path d="M${ ( X( last ) + 7 ).toFixed( 1 ) },${ Y( lastVal ).toFixed( 1 ) } L${ ( X( last ) + 13 ).toFixed( 1 ) },${ endY[ si ].toFixed( 1 ) }" fill="none" stroke="${ color }" stroke-width="2"/>`
					+ `<text x="${ X( last ) + 17 }" y="${ ( endY[ si ] + 3.5 ).toFixed( 1 ) }" class="endlabel">${ Tick( lastVal ) }</text>`
				: '' )
	} ).join( '' )

	//	ホバー: 期ごとの当たり判定 → 全系列の値をツールチップに出す
	const
	hits = labels.map( ( label, i ) => {
		const
		half = labels.length > 1 ? pw / ( labels.length - 1 ) / 2 : pw / 2
		,	x = X( i )
		,	payload = live.map( ( s, si ) => ( {
			label: s.label
		,	color: SERIES_COLORS[ si % SERIES_COLORS.length ]
		,	value: Number.isFinite( s.values[ i ] ) ? Tick( s.values[ i ] ) : '—'
		} ) )
		return `<rect class="hit" x="${ ( x - half ).toFixed( 1 ) }" y="${ T }" width="${ ( half * 2 ).toFixed( 1 ) }" height="${ ph }" fill="transparent"`
			+ ` data-x="${ x.toFixed( 1 ) }" data-period="${ Escape( label ) }" data-series='${ Escape( JSON.stringify( payload ) ) }'/>`
	} ).join( '' )

	//	凡例は2系列以上なら必ず出す（色だけに意味を持たせない）
	const
	legend = live.length > 1
		? `<div class="legend">${ live.map( ( s, si ) =>
			`<span class="lg"><i style="background:${ SERIES_COLORS[ si % SERIES_COLORS.length ] }"></i>${ Escape( s.label ) }</span>`
		).join( '' ) }</div>`
		: ''

	return `<div class="chart" id="${ id }">`
		+ `<div class="chart-title">${ Escape( title ) }<span class="chart-unit">（${ Escape( unit ) }）</span></div>`
		+ legend
		+ `<div class="chart-body">`
		+ `<svg viewBox="0 0 ${ W } ${ H }" role="img" aria-label="${ Escape( title ) }の推移">`
		+ grid + xAxis
		+ `<line class="crosshair" x1="0" y1="${ T }" x2="0" y2="${ T + ph }" stroke="#898781" stroke-width="1" style="display:none"/>`
		+ marks + hits
		+ `</svg><div class="chart-tip" hidden></div></div></div>`
}

//	innerHTML 挿入後に呼ぶ。SVGの当たり判定にツールチップを繋ぐ。
const
BindCharts = holder => {
	for ( const chart of holder.querySelectorAll( '.chart' ) ) {
		const
		body = chart.querySelector( '.chart-body' )
		,	tip = chart.querySelector( '.chart-tip' )
		,	cross = chart.querySelector( '.crosshair' )
		,	svg = chart.querySelector( 'svg' )
		for ( const hit of chart.querySelectorAll( '.hit' ) ) {
			hit.addEventListener( 'mouseenter', () => {
				const
				rows = JSON.parse( hit.dataset.series )
				tip.innerHTML = `<b>${ Escape( hit.dataset.period ) }</b>`
					+ rows.map( r => `<span class="tr"><i style="background:${ r.color }"></i>${ Escape( r.label ) }<em>${ Escape( r.value ) }</em></span>` ).join( '' )
				tip.hidden = false
				cross.style.display = ''
				cross.setAttribute( 'x1', hit.dataset.x )
				cross.setAttribute( 'x2', hit.dataset.x )
				//	SVG座標 → 表示座標
				const
				ratio = svg.clientWidth / svg.viewBox.baseVal.width
				,	x = Number( hit.dataset.x ) * ratio
				tip.style.left = `${ Math.min( Math.max( x, 8 ), body.clientWidth - tip.offsetWidth - 8 ) }px`
			} )
		}
		body.addEventListener( 'mouseleave', () => { tip.hidden = true ; cross.style.display = 'none' } )
	}
}

const
FinanceHtml = data => {
	const
	blocks = []

	//	Zaimujoho は EDINET有報の「提出会社の経営指標等の推移」（直近5期）。
	//	CSVは5行すべてに“当期”の事業年度を入れており、期を区別するのは回次だけ
	//	（0=当期, 1=1期前 … 4=4期前）。本家に倣い古い順に並べた推移表で見せる。
	if ( data.zaimu.length ) {
		const
		periods = data.zaimu.slice().sort( ( a, b ) => Number( b.kaiji ) - Number( a.kaiji ) )	//	4期前 → 当期
		,	latest = data.zaimu.find( z => Number( z.kaiji ) === 0 ) ?? data.zaimu[ 0 ]
		,	Head = z => Number( z.kaiji ) === 0 ? '当期' : `${ Number( z.kaiji ) }期前`
		,	MONEY_FIELDS = [ 'revenue', 'keijo', 'jun', 'shihon', 'junshisan', 'soshisan' ]
			//	本家に倣い大きな額は百万円単位。小さな法人は精度を落とさぬよう円のまま。
		,	scale = Math.max(
				...data.zaimu.flatMap( z => MONEY_FIELDS.map( f => Math.abs( Number( String( z[ f ] ?? '' ).replace( /,/g, '' ) ) || 0 ) ) )
			) >= 1e9 ? 1e6 : 1
		,	unit = scale === 1e6 ? '百万円' : '円'
		,	Amount = s => {
			const
			n = Number( String( s ?? '' ).replace( /,/g, '' ) )
			return ( s !== '' && s != null && Number.isFinite( n ) ) ? Math.round( n / scale ).toLocaleString( 'ja-JP' ) : '—'
		}
		,	METRICS = [
			[ latest.revenueLabel ?? '売上高', unit, z => Amount( z.revenue ) ]
		,	[ '経常利益', unit, z => Amount( z.keijo ) ]
		,	[ '当期純利益', unit, z => Amount( z.jun ) ]
		,	[ '資本金', unit, z => Amount( z.shihon ) ]
		,	[ '純資産額', unit, z => Amount( z.junshisan ) ]
		,	[ '総資産額', unit, z => Amount( z.soshisan ) ]
		,	[ '従業員数', '人', z => z.employee ? Num( z.employee ) : '—' ]
		]
		,	holders = data.zaimu.flatMap( z => z.holders ).slice( 0, 10 )

			//	グラフ用。表と同じ単位（百万円 or 円）に揃えた数値。
		,	Value = ( z, field ) => {
			const
			n = Number( String( z[ field ] ?? '' ).replace( /,/g, '' ) )
			return ( z[ field ] !== '' && z[ field ] != null && Number.isFinite( n ) ) ? n / scale : null
		}
		,	xLabels = periods.map( Head )
		,	Series = ( label, field ) => ( { label, values: periods.map( z => Value( z, field ) ) } )
			//	単位が違うものを同じ軸に載せないため、損益(フロー)と財政状態(ストック)を分ける
		,	charts = TrendChart( '損益の推移', unit, xLabels, [
				Series( latest.revenueLabel ?? '売上高', 'revenue' )
			,	Series( '経常利益', 'keijo' )
			,	Series( '当期純利益', 'jun' )
			] )
			+ TrendChart( '財政状態の推移', unit, xLabels, [
				Series( '総資産額', 'soshisan' )
			,	Series( '純資産額', 'junshisan' )
			] )

		blocks.push(
			`<div class="fin-block"><div class="fin-title">提出会社の経営指標等の推移`
			+ `<span class="fin-meta">当期 ${ Escape( latest.year ) }</span></div>`
			+ ( latest.kijun ? `<div class="fin-note">会計基準: ${ Escape( latest.kijun ) }</div>` : '' )
			+ charts
			+ `<div class="tablewrap"><table class="grid fin-trend"><thead><tr><th>回次</th><th></th>${
				periods.map( z => `<th>${ Head( z ) }</th>` ).join( '' )
			}</tr></thead><tbody>${
				METRICS.map( ( [ label, u, get ] ) =>
					`<tr><th>${ Escape( label ) }</th><td class="unit">（${ Escape( u ) }）</td>${
						periods.map( z => `<td class="amount">${ get( z ) }</td>` ).join( '' )
					}</tr>`
				).join( '' )
			}</tbody></table></div>`
			+ ( holders.length
				? `<div class="fin-sub">大株主の状況</div><div class="tablewrap"><table class="grid"><thead><tr><th>氏名又は名称</th><th>所有株式数の割合</th></tr></thead><tbody>${
					holders.map( h => `<tr><td>${ Escape( h.name ) }</td><td class="amount">${ h.ratio ? ( Number( h.ratio ) * 100 ).toFixed( 2 ) + '%' : '—' }</td></tr>` ).join( '' )
				}</tbody></table></div>`
				: '' )
			+ '</div>'
		)
	}
	for ( const k of data.kessan ) {
		blocks.push(
			`<div class="fin-block"><div class="fin-title">${ Escape( k.period ) }`
			+ `<span class="fin-meta">公告 ${ Escape( k.release ) }　${ Escape( k.unit ) }</span></div>`
			+ k.tables.map( t =>
				`<div class="fin-sub">${ Escape( t.name ) }${ t.date ? `（${ Escape( t.date ) }）` : '' }</div>`
				+ `<div class="tablewrap"><table class="grid"><tbody>${
					t.rows.map( r => `<tr><td>${ Escape( r.subject ) }</td><td class="amount">${ Num( r.amount ) }</td></tr>` ).join( '' )
				}</tbody></table></div>`
			).join( '' )
			+ '</div>'
		)
	}
	return blocks.length ? blocks.join( '' ) : '<div class="empty">財務・決算公告データなし</div>'
}

const
LoadFinance = async num => {
	const
	holder = document.getElementById( 'finance' )
	if ( !holder ) return
	try {
		const
		data = await GetJSON( `/api/gbiz/finance?num=${ encodeURIComponent( num ) }` )
		//	zaimu の5行は1つの推移表なので件数は 有報1 + 決算公告n
		,	count = ( data.zaimu.length ? 1 : 0 ) + data.kessan.length
		holder.innerHTML = count ? Fold( '財務', count, FinanceHtml( data ), true ) : ''
		BindCharts( holder )
	} catch ( e ) {
		holder.innerHTML = Fold( '財務', 0, `<pre class="error">${ Escape( e.message ) }</pre>`, true )
	}
}

const
OpenCompany = async num => {
	const
	holder = $( 'detail' )
	holder.innerHTML = '<div class="empty">読み込み中...</div>'
	try {
		RenderCompany( await GetJSON( `/db/gbiz/hojin/${ encodeURIComponent( num ) }` ) )
		LoadFinance( num )	//	財務は後追いで差し込む
	} catch ( e ) {
		holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

///////////////////////////////	初期化

const
FillPrefs = async () => {
	try {
		const
		prefs = await GetJSON( '/api/gbiz/prefs' )
		$( 'pref' ).insertAdjacentHTML( 'beforeend', prefs.map( p => `<option value="${ Escape( p ) }">${ Escape( p ) }</option>` ).join( '' ) )
	} catch { /* 失敗しても全国のまま */ }
}

$( 'search' ).addEventListener( 'click', Search )
$( 'q' ).addEventListener( 'keydown', e => { if ( e.key === 'Enter' ) Search() } )
$( 'pref' ).addEventListener( 'change', Search )
FillPrefs()

//	?num=法人番号 で直接その法人を開く（SQLの結果行からの遷移用）。
//	検索欄にも入れておくと、戻ったときに一覧が出せる。
const
Deeplink = () => {
	const
	num = new URL( location.href ).searchParams.get( 'num' )
	if ( !num ) return
	$( 'q' ).value = num
	Search()
	OpenCompany( num )
}
Deeplink()
