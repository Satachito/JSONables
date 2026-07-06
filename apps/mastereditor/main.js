//	MasterEditor: master-data CRUD for oldmac jockeys/trainers/farms/owners and
//	chuko.abbreviation. Port of MasterEditor/MainForm.cs.

import { EditableGrid } from '/apps/shared/grid.js'
import { PrintMaster } from './drawer.js'

//	Tab configs mirror the C# print column layouts (dx in page units).
const
TABS = {
	'騎手': {
		db: 'oldmac', table: 'o_jockey', filterField: 'NAME', leading: true
	,	printColumns: [ [ 'JOCKEY', 32 ], [ 'NAME', 120 ], [ 'SHORT_NAME', 120 ], [ 'GENRYO', 24 ], [ 'LEADING', 24 ], [ 'JRA', 0 ] ]
	}
,	'調教師': {
		db: 'oldmac', table: 'o_trainer', filterField: 'NAME'
	,	printColumns: [ [ 'TRAINER', 32 ], [ 'NAME', 120 ], [ 'SHORT_NAME', 120 ], [ 'CENTER', 24 ], [ 'JRA', 0 ] ]
	}
,	'牧場': {
		db: 'oldmac', table: 'o_farm', filterField: 'SHORT_NAME'
	,	printColumns: [ [ 'FARM', 32 ], [ 'NAME', 360 ], [ 'SHORT_NAME', 120 ], [ 'JRA', 0 ] ]
	}
,	'馬主': {
		db: 'oldmac', table: 'o_owner', filterField: 'SHORT_NAME'
	,	printColumns: [ [ 'OWNER', 32 ], [ 'NAME', 360 ], [ 'SHORT_NAME', 120 ], [ 'JRA', 0 ] ]
	}
,	'略称': {
		db: 'chuko', table: 'abbreviation', filterField: 'Plain'
	,	printColumns: [ [ 'Plain', 360 ], [ 'Domain', 120 ], [ 'Abbreviation', 0 ] ]
	}
}

const
$ = id => document.getElementById( id )

const
grids = {}
let
current = null

const
Status = () => {
	const
	el = $( 'status' )
	el.textContent = current.IsDirty() ? '未保存の変更あり' : `${ current.Visible().length } 件`
	el.classList.toggle( 'dirty', current.IsDirty() )
}

const
Activate = async name => {
	const
	config = TABS[ name ]
	if ( !grids[ name ] ) {
		grids[ name ] = new EditableGrid( $( 'gridbox' ), config )
		grids[ name ].onDirty = Status
		await grids[ name ].load()
	}
	current = grids[ name ]
	current.config = config
	current.Render()
	$( 'filter' ).value = current.filterText
	$( 'leadingBox' ).style.display = config.leading ? '' : 'none'
	for ( const b of $( 'tabs' ).children ) b.classList.toggle( 'active', b.textContent === name )
	Status()
}

for ( const name in TABS ) {
	const
	button = document.createElement( 'button' )
	button.textContent = name
	button.addEventListener( 'click', () => Activate( name ) )
	$( 'tabs' ).appendChild( button )
}

$( 'filter' ).addEventListener( 'input', () => { current.SetFilter( $( 'filter' ).value ); Status() } )
$( 'add' ).addEventListener( 'click', () => current.AddRow() )
$( 'delete' ).addEventListener( 'click', () => { if ( confirm( '削除してよろしいですか？' ) ) current.DeleteSelected() } )
$( 'save' ).addEventListener( 'click', async () => {
	try {
		await current.save()
	} catch ( e ) {
		alert( e.message )
	}
	Status()
} )
$( 'print' ).addEventListener( 'click', () => PrintMaster( current.Visible().map( _ => _.object ), Object.values( TABS ).find( t => t === current.config ).printColumns ) )

$( 'leadingYear' ).value = new Date().getFullYear()
$( 'leading' ).addEventListener( 'click', async () => {
	const
	button = $( 'leading' )
	button.disabled = true
	try {
		const
		$$ = await fetch( '/api/leading', { method: 'POST', body: JSON.stringify( { year: $( 'leadingYear' ).value } ) } )
		if ( !$$.ok ) throw new Error( await $$.text() )
		const
		ranking = await $$.json()
		await current.load()
		Status()
		alert( '完了\n' + ranking.map( _ => `${ _.rank }位 ${ _.name } ${ _.counts.join( '-' ) }` ).join( '\n' ) )
	} catch ( e ) {
		alert( e.message )
	} finally {
		button.disabled = false
	}
} )

Activate( '騎手' )
