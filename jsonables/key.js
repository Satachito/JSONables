//	Logical keys: legacy/import identity fields joined with '|', in meta.keyFields order.
//	JSONables CRUD ids are generated separately; these keys support lookup/collapse.
//	Legacy-style records are arrays (field names in meta.fields), Full-JSON records are objects.

export const
KEY_SEPARATOR = '|'

export const
DeriveKey = ( record, meta ) => Array.isArray( record )
?	meta.keyFields.map( f => String( record[ meta.fields.indexOf( f ) ] ) ).join( KEY_SEPARATOR )
:	meta.keyFields.map( f => String( record[ f ] ) ).join( KEY_SEPARATOR )

export const
AssertKeyable = _ => {
	if ( String( _ ).includes( KEY_SEPARATOR ) ) throw new Error( `Key component contains '${ KEY_SEPARATOR }': ${ _ }` )
	return _
}
