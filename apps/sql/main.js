const
$ = id => document.getElementById( id )

const
SetStatus = ( text, error = false ) => {
	const
	status = $( 'status' )
	status.textContent = text
	status.classList.toggle( 'dirty', error )
}

const
Escape = value => String( value ?? '' ).replace( /[&<>"']/g, ch => ( {
	'&': '&amp;'
,	'<': '&lt;'
,	'>': '&gt;'
,	'"': '&quot;'
,	"'": '&#39;'
}[ ch ] ) )

const
RenderTable = ( result ) => {
	const
	holder = $( 'result' )
	if ( !result.rows.length ) {
		holder.innerHTML = '<div class="empty">0 件</div>'
		return
	}

	holder.innerHTML = `<table class="grid"><thead><tr>${
		result.columns.map( column => `<th>${ Escape( column ) }</th>` ).join( '' )
	}</tr></thead><tbody>${
		result.rows.map( row => `<tr>${
			result.columns.map( column => `<td>${ Escape( row[ column ] ) }</td>` ).join( '' )
		}</tr>` ).join( '' )
	}</tbody></table>`
}

const
Run = async () => {
	const
	button = $( 'run' )
	button.disabled = true
	SetStatus( '実行中...' )
	try {
		const
		response = await fetch( '/api/sql', {
			method	: 'POST'
		,	body	: JSON.stringify( { sql: $( 'sql' ).value } )
		} )
		if ( !response.ok ) throw new Error( await response.text() )
		const
		result = await response.json()
		RenderTable( result )
		SetStatus( `${ result.returned } 件` + ( result.capped ? ' / 上限あり' : '' ) )
	} catch ( e ) {
		$( 'result' ).innerHTML = `<pre class="error">${ Escape( e.message ) }</pre>`
		SetStatus( 'エラー', true )
	} finally {
		button.disabled = false
	}
}

const
InsertQuery = ( db, table ) => {
	$( 'sql' ).value = `SELECT *\nFROM ${ db }.${ table }\nLIMIT 100;`
	Run()
}

const
RenderSchema = schema => {
	const
	holder = $( 'schema' )
	holder.replaceChildren()
	for ( const [ db, tables ] of Object.entries( schema ) ) {
		const
		details = document.createElement( 'details' )
		details.open = db === 'oldmac'
		const
		summary = document.createElement( 'summary' )
		summary.textContent = db
		details.appendChild( summary )

		for ( const [ table, meta ] of Object.entries( tables ) ) {
			const
			button = document.createElement( 'button' )
			button.type = 'button'
			button.textContent = `${ table } (${ meta.recordCount })`
			button.title = ( meta.fields ?? [] ).join( ', ' )
			button.addEventListener( 'click', () => InsertQuery( db, table ) )
			details.appendChild( button )
		}
		holder.appendChild( details )
	}
}

$( 'run' ).addEventListener( 'click', Run )
$( 'clear' ).addEventListener( 'click', () => {
	$( 'sql' ).value = ''
	$( 'result' ).replaceChildren()
	SetStatus( '' )
} )
$( 'sql' ).addEventListener( 'keydown', e => {
	if ( ( e.metaKey || e.ctrlKey ) && e.key === 'Enter' ) Run()
} )

fetch( '/api/sql/schema' )
.then( response => response.json() )
.then( RenderSchema )
.catch( e => SetStatus( e.message, true ) )

Run()
