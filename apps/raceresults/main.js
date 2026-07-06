//	RaceResults: browser shell for race import/search and ResultDrawer preview.

import { PrintCanvases } from '/apps/shared/drawlib.js'
import { Course, JyoCD2StrJPN } from '/apps/shared/deumacodes.js'
import { ResultDrawer } from './resultdrawer.js'

const
$ = id => document.getElementById( id )

const
JYO_OPTIONS = [ '01', '02', '03', '04', '05', '06', '07', '08', '09', '10' ]

const
state = {
	races: []
,	selectedRace: null
,	lastCanvas: null
}

const
Pad2 = v => String( v ).padStart( 2, '0' )

const
Params = entries => new URLSearchParams(
	Object.entries( entries ).filter( ( [ , value ] ) => value !== '' && value != null )
)

const
FetchJSON = async ( resource, options ) => {
	const
	response = await fetch( resource, options )
	if ( !response.ok ) throw new Error( await response.text() )
	return response.json()
}

const
Status = text => { $( 'status' ).textContent = text }

const
RaceParams = race => ( {
	year: $( 'year' ).value
,	jyo: $( 'jyo' ).value
,	kaiji: $( 'kaiji' ).value
,	nichiji: $( 'nichiji' ).value
,	racenum: race?.id_RaceNum ?? state.selectedRace?.id_RaceNum
} )

const
Pace = () => ( {
	nikaku: $( 'nikaku' ).value
,	mukousyou: $( 'mukousyou' ).value
,	sankaku: $( 'sankaku' ).value
,	yonkaku: $( 'yonkaku' ).value
} )

const
RaceLabel = race => {
	const
	title = [ race.RaceInfo_Hondai, race.RaceInfo_Fukudai ].filter( Boolean ).join( ' ' )
,	course = [ Course( race ), race.Kyori ? `${ race.Kyori }m` : '' ].filter( Boolean ).join( ' ' )
	return { title, course }
}

const
SelectRace = async race => {
	state.selectedRace = race
	for ( const child of $( 'raceList' ).children ) child.classList.toggle( 'selected', child.dataset.racenum === String( race.id_RaceNum ) )
	const
	label = RaceLabel( race )
	$( 'raceTitle' ).textContent = [ `${ +race.id_RaceNum }R`, label.title ].filter( Boolean ).join( ' ' )
	await RenderRace()
}

const
RenderRaceList = () => {
	const
	box = $( 'raceList' )
	box.replaceChildren()
	state.selectedRace = null
	state.lastCanvas = null
	$( 'print' ).disabled = true
	$( 'raceTitle' ).textContent = '未選択'
	$( 'preview' ).replaceChildren()

	if ( state.races.length === 0 ) {
		const
		empty = document.createElement( 'div' )
		empty.className = 'empty'
		empty.textContent = 'レースがありません'
		box.appendChild( empty )
		return
	}

	for ( const race of state.races ) {
		const
		label = RaceLabel( race )
	,	button = document.createElement( 'button' )
		button.type = 'button'
		button.className = 'race-item'
		button.dataset.racenum = race.id_RaceNum
		button.innerHTML = `
			<div class="race-main">
				<span class="race-no">${ +race.id_RaceNum }R</span>
				<span class="race-meta">${ label.course }</span>
			</div>
			<div class="race-meta">${ label.title || ' ' }</div>
		`
		button.addEventListener( 'click', () => SelectRace( race ) )
		box.appendChild( button )
	}
}

const
LoadDay = async () => {
	Status( 'レース取得中...' )
	state.races = await FetchJSON( `/api/race-day?${ Params( RaceParams() ) }` )
	RenderRaceList()
	Status( `${ state.races.length } レース` )
	if ( state.races.length > 0 ) await SelectRace( state.races[ 0 ] )
}

const
ImportRace = async () => {
	Status( 'JV取込中...' )
	const
	log = await FetchJSON( '/api/import-race', {
		method: 'POST'
	,	body: JSON.stringify( RaceParams() )
	} )
	await LoadDay()
	Status( log.at( -1 ) ?? 'JV取込完了' )
}

const
RenderRace = async () => {
	if ( !state.selectedRace ) return
	Status( '帳票データ取得中...' )
	try {
		const
		rows = await FetchJSON( `/api/result-data?${ Params( RaceParams() ) }` )
	,	canvas = await ResultDrawer.Render( rows, Pace() )
		state.lastCanvas = canvas
		$( 'preview' ).replaceChildren( canvas )
		$( 'print' ).disabled = false
		Status( `${ rows.length } 頭` )
	} catch ( e ) {
		state.lastCanvas = null
		$( 'print' ).disabled = true
		const
		empty = document.createElement( 'div' )
		empty.className = 'empty'
		empty.textContent = e.message.includes( 'No result data' ) ? '帳票データがありません。JV取込を実行してください。' : e.message
		$( 'preview' ).replaceChildren( empty )
		Status( '帳票なし' )
	}
}

const
Search = async () => {
	const
	text = $( 'bamei' ).value.trim()
	if ( text === '' ) return
	Status( '馬名検索中...' )
	const
	results = await FetchJSON( `/api/search-bamei?${ Params( { text, type: $( 'searchType' ).value } ) }` )
	$( 'searchResults' ).replaceChildren()
	for ( const result of results.slice( 0, 100 ) ) {
		const
		button = document.createElement( 'button' )
		button.type = 'button'
		button.className = 'search-item'
		button.innerHTML = `
			<div>${ result.Bamei }</div>
			<div class="search-meta">${ result.id_Year }年 ${ result.id_MonthDay } ${ +result.id_Kaiji }回${ JyoCD2StrJPN( result.id_JyoCD ) }${ +result.id_Nichiji }日 ${ +result.id_RaceNum }R</div>
		`
		button.addEventListener( 'click', async () => {
			$( 'year' ).value = result.id_Year
			$( 'jyo' ).value = result.id_JyoCD
			$( 'kaiji' ).value = +result.id_Kaiji
			$( 'nichiji' ).value = +result.id_Nichiji
			await LoadDay()
			const
			race = state.races.find( _ => +_.id_RaceNum === +result.id_RaceNum )
			if ( race ) await SelectRace( race )
		} )
		$( 'searchResults' ).appendChild( button )
	}
	Status( `${ results.length } 件` )
}

for ( const code of JYO_OPTIONS ) {
	const
	option = document.createElement( 'option' )
	option.value = code
	option.textContent = `${ code } ${ JyoCD2StrJPN( code ) }`
	$( 'jyo' ).appendChild( option )
}

$( 'year' ).value = '2024'
$( 'jyo' ).value = '05'
$( 'kaiji' ).value = '1'
$( 'nichiji' ).value = '1'

$( 'loadDay' ).addEventListener( 'click', () => LoadDay().catch( e => Status( e.message ) ) )
$( 'importRace' ).addEventListener( 'click', () => ImportRace().catch( e => Status( e.message ) ) )
$( 'render' ).addEventListener( 'click', () => RenderRace().catch( e => Status( e.message ) ) )
$( 'print' ).addEventListener( 'click', () => state.lastCanvas && PrintCanvases( [ state.lastCanvas ] ) )
$( 'search' ).addEventListener( 'click', () => Search().catch( e => Status( e.message ) ) )
$( 'bamei' ).addEventListener( 'keydown', event => {
	if ( event.key === 'Enter' ) Search().catch( e => Status( e.message ) )
} )

LoadDay().catch( e => Status( e.message ) )
