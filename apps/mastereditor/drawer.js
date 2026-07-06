//	Master-list printing — port of the *PD_PrintPage handlers in MasterEditor/MainForm.cs:
//	IPA明朝 12pt rows, 16-unit line pitch, fixed column offsets, 1-inch margins.

import {
	Drawer
,	PageCanvas
,	PrintCanvases
,	PAGE_H
} from '/apps/shared/drawlib.js'

const
MARGIN = 100			//	e.MarginBounds: 1 inch = 100 page units
const
LINE = 16

//	columns: [ [ field, dx ], ... ] — dx is the advance after drawing the field.
export const
PrintMaster = ( objects, columns ) => {
	const
	linesPerPage = Math.floor( ( PAGE_H - 2 * MARGIN ) / LINE )
,	canvases = []

	for ( let index = 0; index < objects.length; ) {
		const
		canvas = PageCanvas()
	,	d = new Drawer( canvas )
		d.Translate( MARGIN, MARGIN )

		for ( let line = 0; line < linesPerPage && index < objects.length; line++, index++ ) {
			const
			object = objects[ index ]
			let
			x = 0
			for ( const [ field, dx ] of columns ) {
				d.DrawString( String( object[ field ] ?? '' ), Drawer.sIPAM, 12, x, 0 )
				x += dx
			}
			d.VTranslate( LINE )
		}
		canvases.push( canvas )
	}
	PrintCanvases( canvases )
}
