//	UmaEditor: horse master editor over JSONables generated-id CRUD.

import { LegacyCluster } from '/jsonables/client.js'

const
$ = id => document.getElementById( id )

const
HORSE_FIELDS = [
	'HORSE', 'NAME', 'BIRTHDAY', 'FATHER', 'MOTHER', 'BIRTH_PLACE', 'FARM', 'TRAINER', 'OWNER', 'KIGOU'
,	'TEKISEI', 'OMO_TEKISEI', 'DIRT_OMO_TEKISEI', 'HATSUKO', 'SEX', 'KEIRO', 'KOU_ALL_PRIZE', 'KOU_HON_PRIZE'
,	'RENTAI_NIGE', 'RENTAI_SEN', 'RENTAI_SASHI', 'RENTAI_OI', 'YASUMIAKE_ADJUST_1', 'YASUMIAKE_ADJUST_2'
,	'YASUMIAKE_ADJUST_3', 'YASUMIAKE_ADJUST_4', 'HON_ADJUST', 'SOU_ADJUST', 'KettoJRA', 'HansyokuJRA'
]

const
TABLES = {
	relatives: {
		db: 'oldmac', table: 'o_horse_relative', element: 'relatives'
	,	fields: [ 'HORSE', 'KUBUN', 'RELATIVE', 'COMMENT', 'PRIORITY' ]
	,	defaults: horse => ( { HORSE: horse, KUBUN: 0, RELATIVE: 0, COMMENT: '', PRIORITY: 0 } )
	}
,	noJra: {
		db: 'oldmac', table: 'o_no_jra', element: 'noJra'
	,	fields: [ 'HORSE', 'DATE', 'COURSE', 'PROGRAM_DAY', 'STATUS', 'DISTANCE', 'TDA', 'RACE_NAME', 'SPEC', 'CONDITION', 'ENTRY', 'PACE', 'WINNER_TIME', 'WINNER_NAME', 'FLAGS', 'GATE', 'POSITION', 'ARRIVAL', 'HORSE_WEIGHT', 'TIME', 'DIFF', 'START3F', 'LAST3F', 'BS_POSITION', 'C3_POSITION', 'C4_POSITION', 'C4_ICHIDORI', 'BLINKER', 'POPULAR', 'COMMENT', 'JOCKEY', 'JOCKEY_WEIGHT', 'KOURYU', 'SRLU', 'FUKA1', 'FUKA2' ]
	,	defaults: horse => ( { HORSE: horse, DATE: 0, COURSE: 0, PROGRAM_DAY: 0, STATUS: '', DISTANCE: 0, TDA: 0, RACE_NAME: '', SPEC: '', CONDITION: 0, ENTRY: 0, PACE: 0, WINNER_TIME: 0, WINNER_NAME: '', FLAGS: 0, GATE: 0, POSITION: 0, ARRIVAL: 0, DISQ_REASON: 0, HORSE_WEIGHT: 0, TIME: 0, DIFF: '', START3F: 0, LAST3F: 0, BS_POSITION: 0, C3_POSITION: 0, C4_POSITION: 0, C4_ICHIDORI: 0, BLINKER: 0, POPULAR: 0, COMMENT: '', JOCKEY: '', JOCKEY_WEIGHT: 0, KOURYU: 0, SRLU: 0, FUKA1: '', FUKA2: '' } )
	}
,	bestTimes: {
		db: 'oldmac', table: 'o_best_time', element: 'bestTimes'
	,	fields: [ 'HORSE', 'COURSE', 'DISTANCE', 'TYPE', 'BEST_TIME', 'CONDITION', 'POSITION', 'LRS' ]
	,	defaults: horse => ( { HORSE: horse, COURSE: 0, DISTANCE: 0, TYPE: 'ダ', BEST_TIME: 0, CONDITION: '1', POSITION: 0, LRS: '' } )
	}
,	rests: {
		db: 'oldmac', table: 'o_rest', element: 'rests'
	,	fields: [ 'HORSE', 'DATE', 'NORIKOMI', 'SHIAGARI', 'IDEAL_WEIGHT', 'REST_REASON' ]
	,	defaults: horse => ( { HORSE: horse, DATE: 0, NORIKOMI: 0, SHIAGARI: '○', IDEAL_WEIGHT: 0, REST_REASON: '放牧' } )
	}
,	bloods: {
		db: 'oldmac', table: 'o_blood', element: 'bloods'
	,	fields: [ 'HORSE', 'CONTENT' ]
	,	defaults: horse => ( { HORSE: horse, CONTENT: '' } )
	}
}

const
PROPERTY = {
	syogai: {
		db: 'oldmac', table: 'o_syogai', element: 'syogaiForm'
	,	fields: [ 'HORSE', 'PLACE', 'TIME' ]
	,	defaults: horse => ( { HORSE: horse, PLACE: '', TIME: 0 } )
	}
,	newHorse: {
		db: 'oldmac', table: 'o_new_horse', element: 'newHorseForm'
	,	fields: [ 'HORSE', 'SYOSEN', 'CONTENT1', 'SALE', 'PRICE', 'WEIGHT', 'CONDITION', 'CONTENT2' ]
	,	defaults: horse => ( { HORSE: horse, SYOSEN: '○', CONTENT1: '', SALE: 0, PRICE: 0, WEIGHT: 0, CONDITION: '○', CONTENT2: '' } )
	}
}

const
state = {
	horse: null
,	reference: null
,	detail: null
,	tables: {}
,	properties: {}
}

const
clusters = {
	horse: new LegacyCluster( 'oldmac', 'o_horse' )
}

const
Status = text => { $( 'status' ).textContent = text }

const
Params = object => new URLSearchParams( Object.entries( object ).filter( ( [ , value ] ) => value !== '' && value != null ) )

const
FetchJSON = async ( resource, options ) => {
	const
	response = await fetch( resource, options )
	if ( !response.ok ) throw new Error( await response.text() )
	return response.json()
}

const
FieldInput = ( object, field, onInput ) => {
	const
	label = document.createElement( 'label' )
,	span = document.createElement( 'span' )
,	input = document.createElement( 'input' )
	span.textContent = field
	input.value = object[ field ] ?? ''
	input.addEventListener( 'input', () => onInput( field, input.value ) )
	label.append( span, input )
	return label
}

const
NumericFields = async ( db, table ) => {
	const
	meta = await new LegacyCluster( db, table ).meta()
	return new Set( meta.fields.filter( ( field, index ) => meta.types[ index ] === 'Numeric' ) )
}

const
Coerce = ( numeric, field, value ) => numeric.has( field ) ? ( Number( value ) || 0 ) : value

class
TableEditor {
	constructor( config ) {
		this.config = config
		this.cluster = new LegacyCluster( config.db, config.table )
		this.rows = []
		this.dirty = new Set()
		this.selected = null
		this.numeric = new Set()
	}

	async init() {
		this.numeric = await NumericFields( this.config.db, this.config.table )
	}

	load( rows ) {
		this.rows = rows.map( row => ( { id: row.id, object: { ...row.object }, deleted: false } ) )
		this.dirty.clear()
		this.selected = null
		this.render()
	}

	add( horse ) {
		this.rows.push( { id: null, object: this.config.defaults( horse ), deleted: false } )
		this.dirty.add( this.rows.length - 1 )
		this.render()
	}

	deleteSelected() {
		if ( this.selected == null ) return
		const
		row = this.rows[ this.selected ]
		row.id === null ? this.rows.splice( this.selected, 1 ) : ( row.deleted = true, this.dirty.add( this.selected ) )
		this.selected = null
		this.render()
	}

	async save() {
		for ( let i = 0; i < this.rows.length; i++ ) {
			if ( !this.dirty.has( i ) ) continue
			const
			row = this.rows[ i ]
			if ( row.deleted ) {
				if ( row.id !== null ) await this.cluster.del( row.id )
				continue
			}
			row.id === null
			?	await this.cluster.postObject( row.object )
			:	await this.cluster.putObject( row.id, row.object )
		}
	}

	render() {
		const
		wrap = document.createElement( 'div' )
		wrap.className = 'table-wrap'
		const
		table = document.createElement( 'table' )
		table.className = 'editor'
		const
		head = table.createTHead().insertRow()
		for ( const field of this.config.fields ) {
			const
			th = document.createElement( 'th' )
			th.textContent = field
			head.appendChild( th )
		}
		const
		body = table.createTBody()
		this.rows.forEach( ( row, index ) => {
			if ( row.deleted ) return
			const
			tr = body.insertRow()
			tr.className = ( row.id === null ? 'new ' : '' ) + ( this.selected === index ? 'selected' : '' )
			tr.addEventListener( 'click', () => { this.selected = index; this.render() } )
			for ( const field of this.config.fields ) {
				const
				td = tr.insertCell()
				td.textContent = row.object[ field ] ?? ''
				td.contentEditable = 'plaintext-only'
				td.addEventListener( 'input', () => {
					row.object[ field ] = Coerce( this.numeric, field, td.textContent.trim() )
					this.dirty.add( index )
				} )
			}
		} )
		wrap.appendChild( table )
		$( this.config.element ).replaceChildren( wrap )
	}
}

const
RenderResults = ( container, rows, onSelect ) => {
	$( container ).replaceChildren()
	for ( const row of rows ) {
		const
		button = document.createElement( 'button' )
		button.type = 'button'
		button.className = 'result-item'
		button.innerHTML = `<div>${ row.object.NAME || '(no name)' }</div><div class="result-meta">${ row.object.HORSE } / ${ row.object.BIRTHDAY || '' } / Ketto:${ row.object.KettoJRA || 0 }</div>`
		button.addEventListener( 'click', () => {
			for ( const e of $( container ).children ) e.classList.remove( 'selected' )
			button.classList.add( 'selected' )
			onSelect( row )
		} )
		$( container ).appendChild( button )
	}
}

const
Search = async ( textId, matchId, container, onSelect ) => {
	const
	text = $( textId ).value.trim()
	if ( text === '' ) return
	Status( '検索中...' )
	const
	rows = await FetchJSON( `/api/uma-search?${ Params( { text, type: $( matchId ).value, limit: 120 } ) }` )
	RenderResults( container, rows, onSelect )
	Status( `${ rows.length } 件` )
}

const
RenderFamily = family => {
	const
	items = [
		[ '父', family.father ], [ '父父', family.ff ], [ '父母', family.mf ], [ '母', family.mother ], [ '母父', family.fm ], [ '母母', family.mm ]
	,	[ '詳細', family.detail ], [ '記号', family.kigou ], [ '賞金', family.prize ], [ '調教師', family.trainer ], [ '牧場', family.farm ], [ '馬主', family.owner ], [ '適性', family.tekisei ]
	]
	$( 'family' ).replaceChildren( ...items.map( ( [ label, value ] ) => {
		const
		row = document.createElement( 'div' )
		row.className = 'family-row'
		row.innerHTML = `<span>${ label }</span><div>${ value || '' }</div>`
		return row
	} ) )
}

const
RenderHorseForm = async () => {
	const
	horse = state.horse.object
,	numeric = await NumericFields( 'oldmac', 'o_horse' )
	$( 'horseForm' ).replaceChildren( ...HORSE_FIELDS.map( field => FieldInput( horse, field, ( f, value ) => {
		horse[ f ] = Coerce( numeric, f, value )
		$( 'saveHorse' ).disabled = false
	} ) ) )
	$( 'currentTitle' ).textContent = `${ horse.HORSE } ${ horse.NAME || '' }`
	$( 'saveHorse' ).disabled = true
	$( 'deleteHorse' ).disabled = state.horse.id === null
}

const
LoadHorse = async row => {
	state.horse = { id: row.id, object: { ...row.object } }
	if ( state.horse.id === null ) {
		state.detail = null
		RenderFamily( {} )
		await RenderHorseForm()
		for ( const name in state.tables ) state.tables[ name ].load( [] )
		for ( const name in PROPERTY ) RenderProperty( name, null )
		Status( '新規作成中' )
		return
	}
	Status( '馬データ取得中...' )
	state.detail = await FetchJSON( `/api/uma-detail?${ Params( { horse: row.object.HORSE } ) }` )
	state.horse = { id: state.detail.horse.id, object: { ...state.detail.horse.object } }
	await RenderHorseForm()
	RenderFamily( state.detail.family )
	for ( const name in TABLES ) state.tables[ name ].load( state.detail[ name ] ?? [] )
	RenderProperty( 'syogai', state.detail.syogai )
	RenderProperty( 'newHorse', state.detail.newHorse )
	$( 'setFather' ).disabled = false
	$( 'setMother' ).disabled = false
	$( 'addRelative' ).disabled = false
	Status( '読込完了' )
}

const
RenderProperty = ( name, row ) => {
	const
	config = PROPERTY[ name ]
,	horse = state.horse?.object?.HORSE ?? 0
,	object = row?.object ? { ...row.object } : config.defaults( horse )
	state.properties[ name ] = { id: row?.id ?? null, object }
	$( config.element ).replaceChildren( ...config.fields.map( field => FieldInput( object, field, ( f, value ) => {
		object[ f ] = value
	} ) ) )
}

const
SaveProperty = async name => {
	const
	config = PROPERTY[ name ]
,	prop = state.properties[ name ]
,	cluster = new LegacyCluster( config.db, config.table )
,	numeric = await NumericFields( config.db, config.table )
	for ( const field of config.fields ) prop.object[ field ] = Coerce( numeric, field, prop.object[ field ] )
	prop.id === null ? await cluster.postObject( prop.object ) : await cluster.putObject( prop.id, prop.object )
	await LoadHorse( state.horse )
}

const
SaveHorse = async () => {
	if ( state.horse.id === null ) state.horse.id = await clusters.horse.postObject( state.horse.object )
	else await clusters.horse.putObject( state.horse.id, state.horse.object )
	await LoadHorse( state.horse )
	Status( '保存しました' )
}

const
DeleteHorse = async () => {
	if ( !state.horse?.id || !confirm( '削除してよろしいですか？' ) ) return
	await clusters.horse.del( state.horse.id )
	state.horse = null
	$( 'horseForm' ).replaceChildren()
	$( 'currentTitle' ).textContent = '未選択'
	Status( '削除しました' )
}

const
AddRelative = () => {
	if ( !state.horse || !state.reference ) return
	const
	editor = state.tables.relatives
	editor.add( state.horse.object.HORSE )
	const
	row = editor.rows.at( -1 )
	row.object.RELATIVE = state.reference.object.HORSE
	editor.dirty.add( editor.rows.length - 1 )
	editor.render()
}

const
SaveTable = async name => {
	await state.tables[ name ].save()
	await LoadHorse( state.horse )
	Status( '保存しました' )
}

for ( const name in TABLES ) {
	state.tables[ name ] = new TableEditor( TABLES[ name ] )
	await state.tables[ name ].init()
}

$( 'horseSearch' ).addEventListener( 'click', () => Search( 'horseText', 'horseMatch', 'horseResults', LoadHorse ).catch( e => Status( e.message ) ) )
$( 'horseText' ).addEventListener( 'keydown', e => { if ( e.key === 'Enter' ) Search( 'horseText', 'horseMatch', 'horseResults', LoadHorse ).catch( er => Status( er.message ) ) } )
$( 'referenceSearch' ).addEventListener( 'click', () => Search( 'referenceText', 'referenceMatch', 'referenceResults', row => { state.reference = row; Status( `参照馬: ${ row.object.NAME }` ) } ).catch( e => Status( e.message ) ) )
$( 'referenceText' ).addEventListener( 'keydown', e => { if ( e.key === 'Enter' ) Search( 'referenceText', 'referenceMatch', 'referenceResults', row => { state.reference = row; Status( `参照馬: ${ row.object.NAME }` ) } ).catch( er => Status( er.message ) ) } )
$( 'saveHorse' ).addEventListener( 'click', () => SaveHorse().catch( e => Status( e.message ) ) )
$( 'deleteHorse' ).addEventListener( 'click', () => DeleteHorse().catch( e => Status( e.message ) ) )
$( 'newHorse' ).addEventListener( 'click', async () => {
	const
	next = await FetchJSON( '/api/uma-next-horse' )
	await LoadHorse( { id: null, object: Object.fromEntries( HORSE_FIELDS.map( f => [ f, 0 ] ) ) } )
	state.horse.object.HORSE = next
	state.horse.object.NAME = ''
	state.horse.object.BIRTH_PLACE = ''
	state.horse.object.SEX = ''
	state.horse.object.KEIRO = ''
	await RenderHorseForm()
	$( 'saveHorse' ).disabled = false
} )
$( 'setFather' ).addEventListener( 'click', () => { if ( state.horse && state.reference ) { state.horse.object.FATHER = state.reference.object.HORSE; RenderHorseForm(); $( 'saveHorse' ).disabled = false } } )
$( 'setMother' ).addEventListener( 'click', () => { if ( state.horse && state.reference ) { state.horse.object.MOTHER = state.reference.object.HORSE; RenderHorseForm(); $( 'saveHorse' ).disabled = false } } )
$( 'addRelative' ).addEventListener( 'click', AddRelative )
$( 'saveSyogai' ).addEventListener( 'click', () => SaveProperty( 'syogai' ).catch( e => Status( e.message ) ) )
$( 'saveNewHorse' ).addEventListener( 'click', () => SaveProperty( 'newHorse' ).catch( e => Status( e.message ) ) )

for ( const button of document.querySelectorAll( '[data-tab]' ) ) {
	button.addEventListener( 'click', () => {
		for ( const b of document.querySelectorAll( '[data-tab]' ) ) b.classList.toggle( 'active', b === button )
		for ( const panel of document.querySelectorAll( '.tab-panel' ) ) panel.classList.toggle( 'active', panel.id === `tab-${ button.dataset.tab }` )
	} )
}

for ( const button of document.querySelectorAll( '[data-add-table]' ) ) {
	button.addEventListener( 'click', () => state.horse && state.tables[ button.dataset.addTable ].add( state.horse.object.HORSE ) )
}
for ( const button of document.querySelectorAll( '[data-save-table]' ) ) {
	button.addEventListener( 'click', () => SaveTable( button.dataset.saveTable ).catch( e => Status( e.message ) ) )
}
for ( const button of document.querySelectorAll( '[data-delete-table]' ) ) {
	button.addEventListener( 'click', () => state.tables[ button.dataset.deleteTable ].deleteSelected() )
}
