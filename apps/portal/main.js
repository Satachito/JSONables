import {
	JyoName
,	JRA_TRACKS
,	TrackType
,	Turn
,	UchiSoto
,	Grade
,	RaceName
,	Sex
,	Keiro
,	Tozai
,	Tenko
,	Baba
,	Date8
,	RaceTime
,	Odds
,	Furlong
,	Weight
} from './codes.js'

const
$ = id => document.getElementById( id )

const
Escape = value => String( value ?? '' ).replace( /[&<>"']/g, ch => ( {
	'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ ch ] ) )

const
GetJSON = async url => {
	const
	response = await fetch( url )
	if ( !response.ok ) throw new Error( await response.text() )
	return response.json()
}

///////////////////////////////	タブ

const
ShowTab = name => {
	for ( const button of document.querySelectorAll( '.tabs button' ) ) button.classList.toggle( 'active', button.dataset.tab === name )
	for ( const section of document.querySelectorAll( '.tab' ) ) section.hidden = section.id !== `tab-${ name }`
	//	成績順ランキングを持つタブは、初回表示時に自動集計。
	if ( RANK_KINDS.includes( name ) && !$( `${ name }-result` ).hasChildNodes() ) LoadRanking( name )
	//	出走表タブは初回に最新開催週を読み込む。
	if ( name === 'card' && !$( 'card-week' ).hasChildNodes() ) LoadLatestWeek()
}
for ( const button of document.querySelectorAll( '.tabs button' ) ) button.addEventListener( 'click', () => ShowTab( button.dataset.tab ) )

///////////////////////////////	レース検索

const
FillSelectors = () => {
	const
	thisYear = new Date().getFullYear()
	,	years = []
	for ( let y = thisYear; y >= 1986; y-- ) years.push( `<option>${ y }</option>` )
	$( 'race-year' ).innerHTML = years.join( '' )	//	既定=現在年
}

//	選択年の全レースを 場→開催日→レース の details/summary ツリーで表示。
const
LoadYearRaces = async () => {
	const
	year = $( 'race-year' ).value
	,	holder = $( 'race-tree' )
	holder.innerHTML = '<div class="empty">読み込み中...</div>'
	$( 'race-result' ).replaceChildren()
	try {
		const
		data = await GetJSON( `/api/year-races?year=${ year }` )
		if ( !data.venues.length ) { holder.innerHTML = '<div class="empty">開催なし</div>' ; return }
		holder.replaceChildren()
		for ( const v of data.venues ) {
			const
			venue = document.createElement( 'details' )
			venue.className = 'venue'
			venue.innerHTML = `<summary>${ Escape( v.jyoName ) }<span class="cnt">${ v.days.length }日</span></summary>`
			for ( const d of v.days ) {
				const
				day = document.createElement( 'details' )
				day.className = 'day'
				day.innerHTML = `<summary>${ Date8( year, d.monthday ) }<span class="cnt">${ Number( d.kaiji ) }回${ Number( d.nichiji ) }日</span></summary>`
				for ( const race of d.races ) {
					const
					g = Grade( race.grade )
					,	link = document.createElement( 'button' )
					link.className = 'racelink'
					link.innerHTML = `<b>${ Number( race.racenum ) }R</b> ${ Escape( race.title ) }${ g ? `<em>${ g }</em>` : '' }<span>${ race.td }${ race.distance }m</span>`
					link.addEventListener( 'click', () => {
						for ( const o of holder.querySelectorAll( '.racelink.active' ) ) o.classList.remove( 'active' )
						link.classList.add( 'active' )
						OpenRaceByKey( v.jyo, d.kaiji, d.nichiji, race.racenum )
					} )
					day.appendChild( link )
				}
				venue.appendChild( day )
			}
			holder.appendChild( venue )
		}
	} catch ( e ) {
		holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

//	ツリーのレースを開く: その開催日のRAを取得して結果表示。
const
OpenRaceByKey = async ( jyo, kaiji, nichiji, racenum ) => {
	const
	year = $( 'race-year' ).value
	,	holder = $( 'race-result' )
	holder.innerHTML = '<div class="empty">読み込み中...</div>'
	try {
		const
		races = await GetJSON( `/api/race-day?year=${ year }&jyo=${ jyo }&kaiji=${ kaiji }&nichiji=${ nichiji }` )
		,	ra = races.find( r => Number( r.id_RaceNum ) === Number( racenum ) )
		ra ? OpenRace( ra ) : ( holder.innerHTML = '<div class="empty">レースなし</div>' )
	} catch ( e ) {
		holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

const
RaceLabel = ra => {
	const
	name = RaceName( ra )
	,	grade = Grade( ra.GradeCD )
	,	td = TrackType( ra.TrackCD )
	return {
		num		: Number( ra.id_RaceNum )
	,	title	: name + ( grade ? `(${ grade })` : '' )
	,	sub		: `${ td }${ Number( ra.Kyori ) }m`
	}
}

const
Chaku = h => {
	const
	ijyo = { '1': '取消', '2': '除外', '3': '除外', '4': '中止', '5': '失格', '6': '降着' }[ h.IJyoCD ]
	if ( ijyo && h.IJyoCD !== '0' ) return ijyo
	const
	j = Number( h.KakuteiJyuni )
	return j > 0 ? String( j ) : ''
}

const
RaceHeader = ra => {
	const
	td = TrackType( ra.TrackCD )
	,	turn = Turn( ra.TrackCD )
	,	uchisoto = UchiSoto( ra.TrackCD )
	,	baba = td === 'ダ' ? Baba( ra.TenkoBaba_DirtBabaCD ) : Baba( ra.TenkoBaba_SibaBabaCD )
	,	label = RaceLabel( ra )
	,	meta = [
		`${ Date8( ra.id_Year, ra.id_MonthDay ) } ${ JyoName( ra.id_JyoCD ) } ${ label.num }R`
	,	`${ td }${ Number( ra.Kyori ) }m ${ turn }${ uchisoto }`.trim()
	,	ra.JyokenName?.trim()
	,	[ Tenko( ra.TenkoBaba_TenkoCD ), baba && `馬場${ baba }` ].filter( Boolean ).join( ' ' )
	,	`${ Number( ra.SyussoTosu ) || Number( ra.TorokuTosu ) }頭`
	].filter( Boolean )
	return `<div class="racehead"><h2>${ Escape( label.title || '（未確定）' ) }</h2><div class="meta">${ meta.map( Escape ).join( '　' ) }</div></div>`
}

const
ResultTable = horses => {
	const
	rows = horses
		.slice()
		.sort( ( a, b ) => {
			const
			ja = Number( a.KakuteiJyuni ) || 999
			,	jb = Number( b.KakuteiJyuni ) || 999
			return ( ja - jb ) || ( Number( a.Umaban ) - Number( b.Umaban ) )
		} )
	const
	head = [ '着', '枠', '馬番', '馬名', '性齢', '斤量', '騎手', 'タイム', '上り', '人気', '単勝', '馬体重', '調教師' ]
	return `<table class="grid result-table"><thead><tr>${
		head.map( h => `<th>${ h }</th>` ).join( '' )
	}</tr></thead><tbody>${
		rows.map( h => `<tr>${ [
			Chaku( h )
		,	Number( h.Wakuban ) || ''
		,	Number( h.Umaban ) || ''
		,	`<span class="bamei">${ Escape( h.Bamei?.trim() ) }</span>`
		,	`${ Sex( h.SexCD ) }${ Number( h.Barei ) || '' }`
		,	( Number( h.Futan ) / 10 ).toFixed( 1 )
		,	Escape( h.KisyuRyakusyo?.trim() )
		,	RaceTime( h.Time )
		,	Furlong( h.HaronTimeL3 )
		,	Number( h.Ninki ) || ''
		,	Odds( h.Odds )
		,	Weight( h.BaTaijyu, h.ZogenFugo, h.ZogenSa )
		,	Escape( h.ChokyosiRyakusyo?.trim() )
		].map( cell => `<td>${ cell }</td>` ).join( '' ) }</tr>` ).join( '' )
	}</tbody></table>`
}

const
OpenRace = async ra => {
	const
	holder = $( 'race-result' )
	holder.innerHTML = '<div class="empty">読み込み中...</div>'
	try {
		const
		prefix = [ ra.id_Year, ra.id_MonthDay, ra.id_JyoCD, ra.id_Kaiji, ra.id_Nichiji, ra.id_RaceNum ].join( '|' ) + '|'
		,	pairs = await GetJSON( `/db/jv/jv_se_race_uma/?prefix=${ encodeURIComponent( prefix ) }` )
		,	horses = pairs.map( ( [ , object ] ) => object )
		holder.innerHTML = RaceHeader( ra ) + ( horses.length ? ResultTable( horses ) : '<div class="empty">出走馬データなし</div>' )
	} catch ( e ) {
		holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

//	競走成績の行などから、そのレースをレース検索タブで開く。
const
OpenRaceByParams = async ( { year, jyo, kaiji, nichiji, racenum } ) => {
	ShowTab( 'race' )
	if ( $( 'race-year' ).value !== String( year ) ) {
		$( 'race-year' ).value = String( year )
		await LoadYearRaces()
	}
	OpenRaceByKey( jyo, kaiji, nichiji, racenum )
}

///////////////////////////////	出走表（最新開催週）

const
WakuClass = w => `waku${ Math.min( 8, Math.max( 1, Number( w ) || 1 ) ) }`

//	着順ラベル（異常時は取消/中止等）
const
ChakuLabel = ( chaku, ijyo ) => {
	const
	x = { '1': '取消', '2': '除外', '3': '除外', '4': '中止', '5': '失格', '6': '降着' }[ ijyo ]
	if ( x && ijyo !== '0' ) return x
	return Number( chaku ) > 0 ? `${ Number( chaku ) }着` : ''
}

const
RenderCard = data => {
	const
	holder = $( 'card-result' )
	if ( !data.race ) { holder.innerHTML = '<div class="empty">出走表データなし</div>' ; return }
	const
	r = data.race
	,	grade = Grade( r.grade )
	,	head = `<div class="racehead"><h2>${ Escape( r.jyoName ) }${ Number( r.racenum ) }R　${ Escape( r.title ) }${ grade ? `(${ grade })` : '' }</h2><div class="meta">${ Date8( r.year, r.monthday ) }　${ r.td }${ r.distance }m　${ r.tosu }頭${ r.baba ? `　馬場${ Escape( r.baba ) }` : '' }</div></div>`
	,	body = data.horses.map( h => {
		const
		seiseki = h.record
			? `<span class="rec">[${ h.record.join( '-' ) }]</span>`
			: `<span class="rec-new">${ h.priorStarts === 0 ? '未出走' : `１戦 ${ ChakuLabel( h.soleChaku, h.soleIjyo ) }`.trim() }</span>`
		,	main = `<tr class="card-horse${ h.comment ? ' has-comment' : '' }"><td class="${ WakuClass( h.wakuban ) }">${ Number( h.wakuban ) || '' }</td><td class="umaban">${ Number( h.umaban ) || '' }</td><td class="bamei horse-link" data-ketto="${ Escape( h.ketto ) }">${ Escape( h.bamei ) }</td><td>${ Escape( h.sexBarei ) }</td><td>${ ( Number( h.futan ) / 10 ).toFixed( 1 ) }</td><td>${ Escape( h.jockey ) }</td><td>${ Escape( h.chokyosi ) }${ h.tozai ? `(${ Escape( h.tozai ) })` : '' }</td><td class="rec-cell">${ seiseki }</td></tr>`
		,	note = h.comment
			? `<tr class="comment-row"><td class="${ WakuClass( h.wakuban ) }"></td><td colspan="7"><span class="cbadge">${ h.priorStarts === 0 ? '未出走' : '１走' }${ h.comment.syosen ? ` 印${ Escape( h.comment.syosen ) }` : '' }</span>${ Escape( h.comment.text ) }</td></tr>`
			: ''
		return main + note
	} ).join( '' )
	holder.innerHTML = head + `<table class="grid card-table"><thead><tr><th>枠</th><th>馬番</th><th>馬名</th><th>性齢</th><th>斤量</th><th>騎手</th><th>厩舎</th><th title="1-2-3-4-5着-着外">成績</th></tr></thead><tbody>${ body }</tbody></table>`
	holder.querySelector( 'tbody' ).addEventListener( 'click', event => {
		const
		td = event.target.closest( '.horse-link' )
		if ( td && td.dataset.ketto ) { ShowTab( 'horse' ) ; OpenEntity( 'horse', td.dataset.ketto ) }
	} )
}

const
OpenCard = async ( day, ra ) => {
	const
	holder = $( 'card-result' )
	holder.innerHTML = '<div class="empty">読み込み中...</div>'
	try {
		const
		rn = String( Number( ra.id_RaceNum ) ).padStart( 2, '0' )
		,	data = await GetJSON( `/api/racecard?year=${ day.year }&monthday=${ day.monthday }&jyo=${ day.jyo }&kaiji=${ day.kaiji }&nichiji=${ day.nichiji }&racenum=${ rn }` )
		RenderCard( data )
	} catch ( e ) {
		holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

const
LoadCardDay = async day => {
	const
	list = $( 'card-races' )
	$( 'card-result' ).replaceChildren()
	list.innerHTML = '<div class="empty">読み込み中...</div>'
	try {
		const
		races = ( await GetJSON( `/api/race-day?year=${ day.year }&jyo=${ day.jyo }&kaiji=${ day.kaiji }&nichiji=${ day.nichiji }` ) )
			.sort( ( a, b ) => Number( a.id_RaceNum ) - Number( b.id_RaceNum ) )
		if ( !races.length ) { list.innerHTML = '<div class="empty">レースなし</div>' ; return }
		list.replaceChildren()
		for ( const ra of races ) {
			const
			label = RaceLabel( ra )
			,	chip = document.createElement( 'button' )
			chip.className = 'chip'
			chip.innerHTML = `<b>${ label.num }R</b> ${ Escape( label.title ) }<span>${ label.sub }</span>`
			chip.addEventListener( 'click', () => {
				for ( const other of list.querySelectorAll( '.chip' ) ) other.classList.remove( 'active' )
				chip.classList.add( 'active' )
				OpenCard( day, ra )
			} )
			list.appendChild( chip )
		}
	} catch ( e ) {
		list.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

const
LoadLatestWeek = async () => {
	const
	holder = $( 'card-week' )
	holder.innerHTML = '<div class="empty">読み込み中...</div>'
	$( 'card-races' ).replaceChildren()
	$( 'card-result' ).replaceChildren()
	try {
		const
		wk = await GetJSON( '/api/latest-week' )
		if ( !wk.days.length ) { holder.innerHTML = '<div class="empty">開催なし</div>' ; return }
		holder.replaceChildren()
		for ( const day of wk.days ) {
			const
			button = document.createElement( 'button' )
			button.className = 'dayrow'
			button.innerHTML = `<b>${ Date8( day.year, day.monthday ) } ${ Escape( day.jyoName ) }${ day.nar ? '<em class="koryu">交流</em>' : '' }</b><span>${ day.nar ? '交流競走' : `${ Number( day.kaiji ) }回${ Number( day.nichiji ) }日` } / ${ day.count }R</span>`
			button.addEventListener( 'click', () => {
				for ( const other of holder.querySelectorAll( '.dayrow' ) ) other.classList.remove( 'active' )
				button.classList.add( 'active' )
				LoadCardDay( day )
			} )
			holder.appendChild( button )
		}
		holder.querySelector( '.dayrow' )?.click()	//	先頭の開催を自動で開く
	} catch ( e ) {
		holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

///////////////////////////////	馬名検索

const
SearchHorse = async () => {
	const
	text = $( 'horse-text' ).value.trim()
	,	type = $( 'horse-type' ).value
	,	holder = $( 'horse-result' )
	if ( !text ) return
	ShowBack( 'horse', true )
	$( 'horse-status' ).textContent = '検索中...'
	holder.replaceChildren()
	try {
		const
		rows = await GetJSON( `/api/horses?text=${ encodeURIComponent( text ) }&type=${ encodeURIComponent( type ) }` )
		$( 'horse-status' ).textContent = `${ rows.length } 件`
		if ( !rows.length ) { holder.innerHTML = '<div class="empty">該当なし</div>' ; return }
		const
		table = document.createElement( 'table' )
		table.className = 'grid'
		table.innerHTML = `<thead><tr><th>馬名</th><th>性</th><th>生年</th><th>父</th><th>母</th></tr></thead><tbody>${
			rows.map( ( r, i ) => `<tr data-i="${ i }" class="clickable"><td class="bamei">${ Escape( r.bamei ) }</td><td>${ Escape( r.sex ) }</td><td>${ Escape( r.birth ) }</td><td>${ Escape( r.sire ) }</td><td>${ Escape( r.dam ) }</td></tr>` ).join( '' )
		}</tbody>`
		table.addEventListener( 'click', event => {
			const
			tr = event.target.closest( 'tr[data-i]' )
			if ( tr ) OpenEntity( 'horse', rows[ Number( tr.dataset.i ) ].ketto )
		} )
		holder.appendChild( table )
	} catch ( e ) {
		$( 'horse-status' ).textContent = 'エラー'
		holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

///////////////////////////////	騎手検索

const
SearchJockey = async () => {
	const
	text = $( 'jockey-text' ).value.trim()
	,	holder = $( 'jockey-result' )
	if ( !text ) return
	ShowBack( 'jockey', true )
	$( 'jockey-status' ).textContent = '検索中...'
	holder.replaceChildren()
	try {
		const
		pairs = await GetJSON( `/db/jv/jv_ks_kisyu/?field=KisyuName&contains=${ encodeURIComponent( text ) }&limit=200` )
		,	rows = pairs.map( ( [ , object ] ) => object ).filter( k => k.DelKubun !== '1' )
		$( 'jockey-status' ).textContent = `${ rows.length } 件`
		if ( !rows.length ) { holder.innerHTML = '<div class="empty">該当なし</div>' ; return }
		holder.innerHTML = `<table class="grid"><thead><tr><th>騎手名</th><th>カナ</th><th>性</th><th>所属</th><th>師</th><th>生年月日</th></tr></thead><tbody>${
			rows.map( k => `<tr class="clickable" data-code="${ Escape( k.KisyuCode ) }"><td class="bamei">${ Escape( k.KisyuName?.trim() ) }</td><td>${ Escape( k.KisyuNameKana?.trim() ) }</td><td>${ { '1': '男', '2': '女' }[ k.SexCD ] ?? '' }</td><td>${ Tozai( k.TozaiCD ) }</td><td>${ Escape( k.ChokyosiRyakusyo?.trim() ) }</td><td>${ k.BirthDate_Year ? `${ k.BirthDate_Year }/${ k.BirthDate_Month }/${ k.BirthDate_Day }` : '' }</td></tr>` ).join( '' )
		}</tbody></table>`
	} catch ( e ) {
		$( 'jockey-status' ).textContent = 'エラー'
		holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

///////////////////////////////	調教師検索

const
SearchTrainer = async () => {
	const
	text = $( 'trainer-text' ).value.trim()
	,	holder = $( 'trainer-result' )
	if ( !text ) return
	ShowBack( 'trainer', true )
	$( 'trainer-status' ).textContent = '検索中...'
	holder.replaceChildren()
	try {
		const
		pairs = await GetJSON( `/db/jv/jv_ch_chokyosi/?field=ChokyosiName&contains=${ encodeURIComponent( text ) }&limit=200` )
		,	rows = pairs.map( ( [ , object ] ) => object ).filter( c => c.DelKubun !== '1' )
		$( 'trainer-status' ).textContent = `${ rows.length } 件`
		if ( !rows.length ) { holder.innerHTML = '<div class="empty">該当なし</div>' ; return }
		holder.innerHTML = `<table class="grid"><thead><tr><th>調教師名</th><th>カナ</th><th>所属</th><th>生年月日</th></tr></thead><tbody>${
			rows.map( c => `<tr class="clickable" data-code="${ Escape( c.ChokyosiCode ) }"><td class="bamei">${ Escape( c.ChokyosiName?.trim() ) }</td><td>${ Escape( c.ChokyosiNameKana?.trim() ) }</td><td>${ Tozai( c.TozaiCD ) }</td><td>${ c.BirthDate_Year ? `${ c.BirthDate_Year }/${ c.BirthDate_Month }/${ c.BirthDate_Day }` : '' }</td></tr>` ).join( '' )
		}</tbody></table>`
	} catch ( e ) {
		$( 'trainer-status' ).textContent = 'エラー'
		holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

///////////////////////////////	馬主検索

const
SearchOwner = async () => {
	const
	text = $( 'owner-text' ).value.trim()
	,	holder = $( 'owner-result' )
	if ( !text ) return
	ShowBack( 'owner', true )
	$( 'owner-status' ).textContent = '検索中...'
	holder.replaceChildren()
	try {
		const
		pairs = await GetJSON( `/db/jv/jv_bn_banusi/?field=BanusiName&contains=${ encodeURIComponent( text ) }&limit=200` )
		,	rows = pairs.map( ( [ , object ] ) => object )
		$( 'owner-status' ).textContent = `${ rows.length } 件`
		if ( !rows.length ) { holder.innerHTML = '<div class="empty">該当なし</div>' ; return }
		holder.innerHTML = `<table class="grid"><thead><tr><th>馬主名</th><th>カナ</th><th>法人格付き</th></tr></thead><tbody>${
			rows.map( b => `<tr class="clickable" data-code="${ Escape( b.BanusiCode ) }"><td class="bamei">${ Escape( b.BanusiName?.trim() ) }</td><td>${ Escape( b.BanusiNameKana?.trim() ) }</td><td>${ Escape( b.BanusiName_Co?.trim() ) }</td></tr>` ).join( '' )
		}</tbody></table>`
	} catch ( e ) {
		$( 'owner-status' ).textContent = 'エラー'
		holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

///////////////////////////////	成績順ランキング（各タブの初期表示）

const
RANK_KINDS = [ 'jockey', 'trainer', 'owner', 'horse' ]

const
RankCache = new Map()	//	`${kind}:${from}:${to}` → rows

const
RankSeq = {}	//	kind → 最新リクエスト番号（古い非同期結果の描画を破棄）

const
RankLabel = { jockey: '騎手', trainer: '調教師', owner: '馬主', horse: '馬名' }

//	検索結果表示中だけ「ランキングに戻る」バーを出す。
//	詳細/検索へ移る(on=true)時は、進行中のランキング集計を無効化して
//	遅れて届いた結果が結果表示を上書きしないようにする。
const
ShowBack = ( kind, on ) => {
	$( `${ kind }-back` ).hidden = !on
	if ( on ) RankSeq[ kind ] = ( RankSeq[ kind ] ?? 0 ) + 1
}

//	詳細ビュー中は上の検索バー(期間＋名前検索)を隠す（矛盾を避ける）
const
ShowToolbar = ( kind, on ) => {
	const
	tb = document.querySelector( `#tab-${ kind } .toolbar` )
	//	.toolbar は display:flex 指定があり [hidden] では消えないので inline style で制御
	if ( tb ) tb.style.display = on ? '' : 'none'
}

//	百円単位 → 万円（カンマ区切り）
const
Man = prize => {
	const
	man = Math.round( Number( prize ) / 100 )
	return man ? man.toLocaleString( 'ja-JP' ) : ''
}

//	各タブの集計期間を初期化: 開始=今年の1/1、終了=未設定（現在まで）
const
FillRankPeriods = () => {
	const
	jan1 = `${ new Date().getFullYear() }-01-01`
	for ( const kind of RANK_KINDS ) $( `${ kind }-from` ).value = jan1
}

//	"YYYY-MM-DD" → "YYYYMMDD"（空は空）
const
Ymd = value => String( value ?? '' ).replaceAll( '-', '' )

//	ランキング行クリック → 基本情報＋競走成績の詳細ビューへ
const
OnRankRowClick = ( kind, row ) => OpenEntity( kind, row.code )

const
RenderRanking = ( kind, rows ) => {
	const
	holder = $( `${ kind }-result` )
	ShowBack( kind, false )
	ShowToolbar( kind, true )
	if ( !rows.length ) { holder.innerHTML = '<div class="empty">データなし</div>' ; return }
	const
	table = document.createElement( 'table' )
	table.className = 'grid rank-table'
	table.innerHTML = `<thead><tr><th>順位</th><th>${ RankLabel[ kind ] }</th><th>出走</th><th>1着</th><th>2着</th><th>3着</th><th>本賞金(万円)</th></tr></thead><tbody>${
		rows.map( ( r, i ) => `<tr data-i="${ i }" class="clickable"><td>${ r.rank }</td><td class="bamei">${ Escape( r.name ) }</td><td>${ r.rides }</td><td>${ r.w1 }</td><td>${ r.w2 }</td><td>${ r.w3 }</td><td>${ Man( r.prize ) }</td></tr>` ).join( '' )
	}</tbody>`
	table.addEventListener( 'click', event => {
		const
		tr = event.target.closest( 'tr[data-i]' )
		if ( tr ) OnRankRowClick( kind, rows[ Number( tr.dataset.i ) ] )
	} )
	holder.replaceChildren( table )
}

const
LoadRanking = async kind => {
	const
	from = Ymd( $( `${ kind }-from` ).value )
	,	to = Ymd( $( `${ kind }-to` ).value )
	,	holder = $( `${ kind }-result` )
	,	cacheKey = `${ kind }:${ from }:${ to }`
	if ( !from ) { holder.innerHTML = '<div class="empty">開始日を指定してください</div>' ; return }
	const
	seq = RankSeq[ kind ] = ( RankSeq[ kind ] ?? 0 ) + 1	//	この呼び出しを最新にする
	if ( RankCache.has( cacheKey ) ) return RenderRanking( kind, RankCache.get( cacheKey ) )
	holder.innerHTML = '<div class="empty">集計中...</div>'
	try {
		const
		rows = await GetJSON( `/api/ranking?from=${ from }${ to ? `&to=${ to }` : '' }&kind=${ kind }` )
		RankCache.set( cacheKey, rows )
		if ( RankSeq[ kind ] === seq ) RenderRanking( kind, rows )	//	最新のみ描画
	} catch ( e ) {
		if ( RankSeq[ kind ] === seq ) holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

///////////////////////////////	詳細（基本情報＋競走成績）

//	1レースの着順表示（異常時は取消/除外等）
const
ChakuOf = r => {
	const
	ijyo = { '1': '取消', '2': '除外', '3': '除外', '4': '中止', '5': '失格', '6': '降着' }[ r.ijyo ]
	if ( ijyo && r.ijyo !== '0' ) return ijyo
	const
	j = Number( r.chaku )
	return j > 0 ? String( j ) : ''
}

//	3代血統表（14頭, rowspanレイアウト。sire=父側/dam=母側で色分け）
const
PedigreeTable = ped => {
	const
	n = i => `<td rowspan="${ [ 4, 2, 1 ][ [ 0, 1 ].includes( i ) ? 0 : [ 2, 3, 4, 5 ].includes( i ) ? 1 : 2 ] }" class="${ [ 0, 2, 4, 6, 8, 10, 12 ].includes( i ) ? 'sire' : 'dam' }">${ Escape( ped[ i ] || '－' ) }</td>`
	return `<table class="pedigree"><tbody>`
		+ `<tr>${ n( 0 ) }${ n( 2 ) }${ n( 6 ) }</tr>`
		+ `<tr>${ n( 7 ) }</tr>`
		+ `<tr>${ n( 3 ) }${ n( 8 ) }</tr>`
		+ `<tr>${ n( 9 ) }</tr>`
		+ `<tr>${ n( 1 ) }${ n( 4 ) }${ n( 10 ) }</tr>`
		+ `<tr>${ n( 11 ) }</tr>`
		+ `<tr>${ n( 5 ) }${ n( 12 ) }</tr>`
		+ `<tr>${ n( 13 ) }</tr>`
		+ `</tbody></table>`
}

const
FamilyHtml = data => {
	const
	sibs = data.siblings ?? []
	,	rels = data.relatives ?? []
	,	sibTable = sibs.length
		? `<div class="famtitle">兄弟姉妹（同じ母）</div><table class="grid fam-table"><thead><tr><th>馬名</th><th>性</th><th>生年</th><th>父</th></tr></thead><tbody>${
			sibs.map( s => `<tr class="${ s.ketto ? 'clickable' : '' }" data-ketto="${ Escape( s.ketto ) }"><td class="bamei">${ Escape( s.name ) }</td><td>${ Escape( s.sex ) }</td><td>${ Escape( s.birth ) }</td><td>${ Escape( s.sire ) }</td></tr>` ).join( '' )
		}</tbody></table>`
		: ''
	,	relTable = rels.length
		? `<div class="famtitle">近親</div><table class="grid fam-table"><thead><tr><th>馬名</th><th>区分</th><th>メモ</th></tr></thead><tbody>${
			rels.map( r => `<tr class="${ r.ketto ? 'clickable' : '' }" data-ketto="${ Escape( r.ketto ) }"><td class="bamei">${ Escape( r.name ) }</td><td>${ r.kubun === 0 ? '兄弟' : '近親' }</td><td>${ Escape( r.comment ) }</td></tr>` ).join( '' )
		}</tbody></table>`
		: ''
	return `<div class="family"><div class="famcol"><div class="famtitle">3代血統</div>${ PedigreeTable( data.pedigree ?? [] ) }</div><div class="famcol">${ sibTable }${ relTable }</div></div>`
}

const
RenderEntity = ( kind, data ) => {
	const
	holder = $( `${ kind }-result` )
	,	{ info, summary, races, capped } = data
	,	sotogai = summary.rides - summary.w1 - summary.w2 - summary.w3
	,	pct = summary.rides ? ( summary.w1 / summary.rides * 100 ).toFixed( 1 ) : '0.0'
	,	seisekiLabel = kind === 'horse' ? '通算' : '期間'
	,	pairsHtml = info.pairs.filter( ( [ , v ] ) => v ).map( ( [ k, v ] ) => `<div class="pair"><span class="k">${ Escape( k ) }</span><span class="v">${ Escape( v ) }</span></div>` ).join( '' )
	,	head = `<div class="entityhead"><h2>${ Escape( info.title ) }${ info.subtitle ? ` <small>${ Escape( info.subtitle ) }</small>` : '' }</h2><div class="pairs">${ pairsHtml }</div><div class="seiseki">${ seisekiLabel } ${ summary.rides }戦 [${ summary.w1 }-${ summary.w2 }-${ summary.w3 }-${ sotogai }] 勝率 ${ pct }% ／ 本賞金 ${ Man( summary.prize ) } 万円</div></div>`
	,	family = kind === 'horse' ? FamilyHtml( data ) : ''

	const
	seiseki = !races.length
		? '<div class="empty">競走成績なし</div>'
		: `<div class="famtitle">競走成績</div>`
			+ ( capped ? '<div class="empty">※ 最新300件を表示</div>' : '' )
			+ `<table class="grid seiseki-table"><thead><tr><th>日付</th><th>開催</th><th>レース名</th><th>距離</th><th>馬場</th><th>頭</th><th>枠</th><th>馬番</th><th>人気</th><th>着</th><th>馬名</th><th>騎手</th><th>斤</th><th>タイム</th><th>上り</th><th>馬体重</th></tr></thead><tbody>${
				races.map( ( r, i ) => `<tr data-i="${ i }" class="clickable"><td>${ r.year }/${ r.monthday.slice( 0, 2 ) }/${ r.monthday.slice( 2 ) }</td><td>${ Escape( r.jyoName ) }${ Number( r.racenum ) }R</td><td class="bamei">${ Escape( r.raceTitle ) }${ Grade( r.grade ) ? `(${ Grade( r.grade ) })` : '' }</td><td>${ r.td }${ r.distance || '' }</td><td>${ Escape( r.baba ) }</td><td>${ r.fieldSize || '' }</td><td>${ Number( r.wakuban ) || '' }</td><td>${ Number( r.umaban ) || '' }</td><td>${ Number( r.ninki ) || '' }</td><td>${ ChakuOf( r ) }</td><td class="bamei">${ Escape( r.bamei ) }</td><td>${ Escape( r.jockey ) }</td><td>${ ( Number( r.futan ) / 10 ).toFixed( 1 ) }</td><td>${ RaceTime( r.time ) }</td><td>${ Furlong( r.last3f ) }</td><td>${ Weight( r.baTaijyu, r.zogenFugo, r.zogenSa ) }</td></tr>` ).join( '' )
			}</tbody></table>`

	holder.innerHTML = head + family + seiseki

	holder.querySelector( '.seiseki-table tbody' )?.addEventListener( 'click', event => {
		const
		tr = event.target.closest( 'tr[data-i]' )
		if ( !tr ) return
		const
		r = races[ Number( tr.dataset.i ) ]
		OpenRaceByParams( { year: r.year, jyo: r.jyo, kaiji: r.kaiji, nichiji: r.nichiji, racenum: r.racenum } )
	} )

	//	兄弟/近親の行クリック → その馬の詳細へ
	for ( const table of holder.querySelectorAll( '.fam-table tbody' ) ) table.addEventListener( 'click', event => {
		const
		tr = event.target.closest( 'tr[data-ketto]' )
		if ( tr && tr.dataset.ketto ) OpenEntity( 'horse', tr.dataset.ketto )
	} )
}

//	kind と code（馬=KettoNum, 人=各Code）で詳細ビューを開く
const
OpenEntity = async ( kind, code ) => {
	const
	from = Ymd( $( `${ kind }-from` ).value )
	,	to = Ymd( $( `${ kind }-to` ).value )
	,	holder = $( `${ kind }-result` )
	ShowBack( kind, true )
	ShowToolbar( kind, false )
	holder.innerHTML = '<div class="empty">読み込み中...</div>'
	try {
		const
		data = await GetJSON( `/api/results?kind=${ kind }&code=${ encodeURIComponent( code ) }${ from ? `&from=${ from }` : '' }${ to ? `&to=${ to }` : '' }` )
		RenderEntity( kind, data )
	} catch ( e ) {
		holder.innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
	}
}

///////////////////////////////	初期化

FillSelectors()
FillRankPeriods()
for ( const kind of RANK_KINDS ) for ( const bound of [ 'from', 'to' ] ) $( `${ kind }-${ bound }` ).addEventListener( 'change', () => LoadRanking( kind ) )
for ( const kind of RANK_KINDS ) $( `${ kind }-back` ).querySelector( 'button' ).addEventListener( 'click', () => LoadRanking( kind ) )
//	人(騎手/調教師/馬主)の名前検索結果 → クリックで詳細ビューへ
for ( const kind of [ 'jockey', 'trainer', 'owner' ] ) $( `${ kind }-result` ).addEventListener( 'click', event => {
	const
	tr = event.target.closest( 'tr[data-code]' )
	if ( tr ) OpenEntity( kind, tr.dataset.code )
} )
$( 'race-year' ).addEventListener( 'change', LoadYearRaces )
LoadYearRaces()	//	既定=現在年のツリーを初期表示
$( 'horse-search' ).addEventListener( 'click', SearchHorse )
$( 'horse-text' ).addEventListener( 'keydown', e => { if ( e.key === 'Enter' ) SearchHorse() } )
$( 'jockey-search' ).addEventListener( 'click', SearchJockey )
$( 'jockey-text' ).addEventListener( 'keydown', e => { if ( e.key === 'Enter' ) SearchJockey() } )
$( 'trainer-search' ).addEventListener( 'click', SearchTrainer )
$( 'trainer-text' ).addEventListener( 'keydown', e => { if ( e.key === 'Enter' ) SearchTrainer() } )
$( 'owner-search' ).addEventListener( 'click', SearchOwner )
$( 'owner-text' ).addEventListener( 'keydown', e => { if ( e.key === 'Enter' ) SearchOwner() } )
