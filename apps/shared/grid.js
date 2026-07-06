//	EditableGrid: DataGridView-equivalent over a JSONables LegacyCluster.
//	Loads the whole table (what the WinForms apps did), edits in place, and saves
//	explicit diffs: added → POST, changed → PUT, removed → DELETE.
//	Changing a key field saves as DELETE + POST.

import { LegacyCluster } from '/jsonables/client.js'

const
KeyOf = ( object, keyFields ) => keyFields.map( f => String( object[ f ] ?? '' ) ).join( '|' )

export class
EditableGrid {

	//	config: { db, table, columns?: [field...], filterField, readOnlyFields?: [field...] }
	constructor( container, config ) {
		this.container = container
		this.config = config
		this.cluster = new LegacyCluster( config.db, config.table )
		this.rows = []			//	{ key|null (null = new), object, deleted }
		this.dirty = new Set()	//	row indexes changed
		this.filterText = ''
		this.onDirty = () => {}
	}

	async load() {
		this.meta = await this.cluster.meta()
		this.fields = this.config.columns ?? this.meta.fields
		this.keyFields = this.meta.keyFields
		const
		entries = await this.cluster.listObjects()
		this.rows = entries.map( ( [ key, object ] ) => ( { key, object, deleted: false } ) )
		this.dirty.clear()
		this.Render()
	}

	IsDirty() {
		return this.dirty.size > 0
	}

	Default( field ) {
		const
		type = this.meta.types[ this.meta.fields.indexOf( field ) ]
		return type === 'Numeric' ? 0 : type === 'Boolean' ? false : ''
	}

	//	max+1 over the first key field — the C# JockeyPK()/TrainerPK()... idiom.
	NextPK() {
		const
		field = this.keyFields[ 0 ]
		let max = 0
		for ( const row of this.rows ) {
			const
			value = Number( row.object[ field ] )
			if ( !Number.isNaN( value ) && value > max ) max = value
		}
		return max + 1
	}

	AddRow() {
		const
		object = Object.fromEntries( this.meta.fields.map( f => [ f, this.Default( f ) ] ) )
		if ( this.keyFields.length === 1 && this.meta.types[ this.meta.fields.indexOf( this.keyFields[ 0 ] ) ] === 'Numeric' )
			object[ this.keyFields[ 0 ] ] = this.NextPK()
		this.rows.push( { key: null, object, deleted: false } )
		this.dirty.add( this.rows.length - 1 )
		this.Render()
		this.onDirty()
		this.container.querySelector( 'tbody tr:last-child td[contenteditable]' )?.focus()
	}

	DeleteSelected() {
		let
		any = false
		for ( const tr of this.container.querySelectorAll( 'tr.selected' ) ) {
			const
			row = this.rows[ Number( tr.dataset.index ) ]
			row.key === null
			?	this.rows.splice( Number( tr.dataset.index ), 1 )
			:	( row.deleted = true, this.dirty.add( Number( tr.dataset.index ) ) )
			any = true
		}
		if ( any ) {
			//	Re-render (indexes shift when new rows were removed).
			this.dirty = new Set( [ ...this.dirty ].filter( i => i < this.rows.length ) )
			this.Render()
			this.onDirty()
		}
	}

	async save() {
		for ( let i = 0; i < this.rows.length; i++ ) {
			if ( !this.dirty.has( i ) ) continue
			const
			row = this.rows[ i ]
			if ( row.deleted ) {
				if ( row.key !== null ) await this.cluster.del( row.key )
				continue
			}
			const
			key = KeyOf( row.object, this.keyFields )
			if ( row.key === null ) {
				await this.cluster.postObject( key, row.object )
			} else if ( key === row.key ) {
				await this.cluster.putObject( key, row.object )
			} else {
				await this.cluster.del( row.key )
				await this.cluster.postObject( key, row.object )
			}
		}
		await this.load()
		this.onDirty()
	}

	SetFilter( text ) {
		this.filterText = text
		this.Render()
	}

	//	Rows surviving the current filter (used for printing too).
	Visible() {
		const
		field = this.config.filterField
		return this.rows.filter( row =>
			!row.deleted
		&&	( !this.filterText || String( row.object[ field ] ?? '' ).includes( this.filterText ) )
		)
	}

	Render() {
		const
		table = document.createElement( 'table' )
		table.className = 'grid'

		const
		thead = table.createTHead().insertRow()
		for ( const field of this.fields ) {
			const
			th = document.createElement( 'th' )
			th.textContent = field
			thead.appendChild( th )
		}

		const
		tbody = table.createTBody()
	,	filterField = this.config.filterField
	,	readOnly = new Set( this.config.readOnlyFields ?? [] )

		this.rows.forEach( ( row, index ) => {
			if ( row.deleted ) return
			if ( this.filterText && !String( row.object[ filterField ] ?? '' ).includes( this.filterText ) ) return

			const
			tr = tbody.insertRow()
			tr.dataset.index = index
			if ( row.key === null ) tr.className = 'new'
			tr.addEventListener( 'click', e => {
				if ( e.target.isContentEditable && e.target === document.activeElement ) return
				if ( !e.metaKey && !e.shiftKey ) for ( const s of tbody.querySelectorAll( 'tr.selected' ) ) if ( s !== tr ) s.classList.remove( 'selected' )
				tr.classList.toggle( 'selected' )
			} )

			for ( const field of this.fields ) {
				const
				td = tr.insertCell()
				td.textContent = row.object[ field ] ?? ''
				if ( !readOnly.has( field ) ) {
					td.contentEditable = 'plaintext-only'
					td.addEventListener( 'input', () => {
						const
						type = this.meta.types[ this.meta.fields.indexOf( field ) ]
					,	text = td.textContent.trim()
						row.object[ field ] = type === 'Numeric' ? ( Number( text ) || 0 ) : type === 'Boolean' ? text === 'true' : text
						this.dirty.add( index )
						this.onDirty()
					} )
				}
			}
		} )

		this.container.replaceChildren( table )
	}
}
