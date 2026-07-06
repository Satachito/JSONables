//	Canvas port of the GDI+ Drawer classes (MasterEditor/RaceResults/YUMA Drawer.cs).
//	Same method names and page coordinates (GDI+ printer units: 1/100 inch, A4 = 827 x 1169)
//	so C# drawing code ports line-for-line.
//
//	Usage:
//		const d = new Drawer( PageCanvas() )
//		d.Translate( 50, 50 ); d.ZH( '馬名', Drawer.sIPAM, 12, 0, 0 ); ...
//
//	Fonts: the A-OTF/A-TTC Morisawa families of the original are mapped onto locally
//	available Japanese fonts (see FONT_MAP; calibrate as needed).

export const
PAGE_W = 827

export const
PAGE_H = 1169

//	Render scale: 3 → ~300dpi backing store for crisp print.
export const
DPI_SCALE = 3

export const
PageCanvas = ( width = PAGE_W, height = PAGE_H ) => {
	const
	canvas = document.createElement( 'canvas' )
	canvas.width	= width * DPI_SCALE
	canvas.height	= height * DPI_SCALE
	canvas.style.width	= `${ width }px`
	canvas.style.height	= `${ height }px`
	const
	ctx = canvas.getContext( '2d' )
	ctx.scale( DPI_SCALE, DPI_SCALE )
	ctx.fillStyle = 'white'
	ctx.fillRect( 0, 0, width, height )
	ctx.fillStyle = 'black'
	ctx.strokeStyle = 'black'
	return canvas
}

export class
Drawer {

	//	Font name constants from the C# Drawer — mapped at draw time via FONT_MAP.
	static sChuGBBBP		= 'A-OTF 中ゴシックBBB Pro Medium'
	static sMidashiGMB31P	= 'A-OTF 見出ゴMB31 Pro MB31'
	static sMidashiMMA31P	= 'A-OTF 見出ミンMA31 Pro MA31'
	static sGoMB101			= 'A-TTC ゴシックMB101 R'
	static sRyuminLMinus40	= 'A-TTC リュウミン L-Minus40'
	static sRyuminLMinus20	= 'A-TTC リュウミン L-Minus20'
	static sRyuminLMinus10	= 'A-TTC リュウミン L-Minus10'
	static sRyuminL			= 'A-TTC リュウミン L'
	static sRyuminM			= 'A-TTC リュウミン M'
	static sRyuminR			= 'A-TTC リュウミン R'
	static sNewGoB			= 'A-TTC 新ゴ B'
	static sNewGoL			= 'A-TTC 新ゴ L'
	static sNewGoM			= 'A-TTC 新ゴ M'
	static sIPAPG			= 'IPA Pゴシック'
	static sIPAPM			= 'IPA P明朝'
	static sIPAG			= 'IPAゴシック'
	static sIPAG10			= 'IPAゴシック10'
	static sIPAG20			= 'IPAゴシック20'
	static sIPAG30			= 'IPAゴシック30'
	static sIPAG50			= 'IPAゴシック50'
	static sIPAGMinus10		= 'IPAゴシックMinus10'
	static sIPAGMinus20		= 'IPAゴシックMinus20'
	static sIPAM			= 'IPA明朝'
	static sIPAM10			= 'IPA明朝10'
	static sIPAM20			= 'IPA明朝20'
	static sIPAM30			= 'IPA明朝30'
	static sIPAM40			= 'IPA明朝40'
	static sIPAM50			= 'IPA明朝50'
	static sIPAMMinus10		= 'IPA明朝Minus10'
	static sIPAMMinus20		= 'IPA明朝Minus20'

	//	Every 明朝(M)-ish name → mincho stack, everything else → gothic stack.
	//	IPAex fonts are @font-face'd in shared/fonts.css when present.
	static MINCHO	= `'IPAexMincho', 'IPAex明朝', 'Hiragino Mincho ProN', serif`
	static GOTHIC	= `'IPAexGothic', 'IPAexゴシック', 'Hiragino Kaku Gothic ProN', sans-serif`

	static Family( name ) {
		return /明朝|ミン|リュウミン|Mincho/.test( name ) ? Drawer.MINCHO : Drawer.GOTHIC
	}

	constructor( canvas ) {
		this.canvas = canvas
		this.g = canvas.getContext( '2d' )
	}

	//	MakeFont: GDI+ used em-size * 0.974 in world units. Returns a CSS font string
	//	carrying the logical size along.
	MakeFont( name, size ) {
		return { css: `${ size * 0.974 }px ${ Drawer.Family( name ) }`, name, size }
	}

	SetFont( font ) {
		this.g.font = font.css
	}

	GSave()		{ this.g.save() }
	GRestore()	{ this.g.restore() }

	Translate( x, y )	{ this.g.translate( x, y ) }
	HTranslate( p )		{ this.g.translate( p, 0 ) }
	VTranslate( p )		{ this.g.translate( 0, p ) }
	HScale( p )			{ this.g.scale( p, 1 ) }
	VScale( p )			{ this.g.scale( 1, p ) }

	Line( x0, y0, x1, y1, width ) {
		const
		g = this.g
		g.save()
		g.lineWidth = width
		g.beginPath()
		g.moveTo( x0, y0 )
		g.lineTo( x1, y1 )
		g.stroke()
		g.restore()
	}

	HLine( x, y, w, h )	{ this.Line( x, y, x + w, y, h ) }
	VLine( x, y, w, h )	{ this.Line( x, y, x, y + h, w ) }
	HLine1( x, y, w )	{ this.Line( x, y, x + w, y, 0.45 ) }
	VLine1( x, y, h )	{ this.Line( x, y, x, y + h, 0.8 ) }
	HLine2( x, y, w )	{ this.Line( x, y, x + w, y, 0.90 ) }
	VLine2( x, y, h )	{ this.Line( x, y, x, y + h, 1.6 ) }

	FillRect( x, y, w, h )		{ this.g.fillRect( x, y, w, h ) }
	StrokeRect( x, y, w, h )	{ const g = this.g; g.save(); g.lineWidth = 0.4; g.strokeRect( x, y, w, h ); g.restore() }

	Ellipse( x, y, w, h, fill ) {
		const
		g = this.g
		g.beginPath()
		g.ellipse( x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2 )
		fill ? g.fill() : ( g.save(), g.lineWidth = 0.4, g.stroke(), g.restore() )
	}

	FillEllipse( x, y, w, h )	{ this.Ellipse( x, y, w, h, true ) }
	StrokeEllipse( x, y, w, h )	{ this.Ellipse( x, y, w, h, false ) }

	Grid( p ) {
		const
		g = this.g
		g.save()
		g.strokeStyle = 'red'
		g.lineWidth = 0.3
		for ( let x = p; x < PAGE_W; x += p ) { g.beginPath(); g.moveTo( x, 0 ); g.lineTo( x, PAGE_H ); g.stroke() }
		for ( let y = p; y < PAGE_H; y += p ) { g.beginPath(); g.moveTo( 0, y ); g.lineTo( PAGE_W, y ); g.stroke() }
		g.restore()
	}

	//	Plain GDI+ g.DrawString( text, font, brush, x, y ): top-left anchored.
	DrawString( text, name, size, x, y ) {
		const
		g = this.g
		g.save()
		this.SetFont( this.MakeFont( name, size ) )
		g.textAlign = 'left'
		g.textBaseline = 'top'
		g.fillText( text, x, y )
		g.restore()
	}

	Measure( text, font ) {
		this.g.save()
		this.SetFont( font )
		const
		m = this.g.measureText( text )
		this.g.restore()
		return { width: m.width, height: font.size * 1.25 }
	}

	//	Core horizontal draw: text centered within `width` starting at x, top edge y.
	//	(GDI+ _H: rect x-(w-width)/2 .. + per-font vertical fudge — collapsed into one rule here.)
	_H( text, font, width, x, y ) {
		const
		g = this.g
		g.save()
		this.SetFont( font )
		g.textAlign = 'center'
		g.textBaseline = 'middle'
		g.fillText( text, x + width / 2, y + font.size / 2 )
		g.restore()
	}

	//	AH: half-width columns — width = size/2 * length.
	AH( text, name, size, x, y ) {
		this._H( text, this.MakeFont( name, size ), size / 2 * text.length, x, y )
	}

	//	AHR: right-aligned AH.
	AHR( text, name, size, x, y ) {
		const
		w = size / 2 * text.length
		this._H( text, this.MakeFont( name, size ), w, x - w, y )
	}

	_ZH( text, font, size, x, y ) {
		this._H( text, font, size * text.length, x, y )
	}

	//	Vertical text: one glyph per cell of `size`, centered on column x..x+size.
	//	Long-vowel marks and ASCII rotate 90°, small-kana nudge — the GDI+ '@font' behaviour.
	_ZV( text, font, size, x, y ) {
		const
		g = this.g
		g.save()
		this.SetFont( font )
		g.textAlign = 'center'
		g.textBaseline = 'middle'
		for ( let i = 0; i < text.length; i++ ) {
			const
			c = text[ i ]
		,	cx = x + size / 2
		,	cy = y + i * size + size / 2
			if ( /[ー－〜～…‥（）「」『』［］｛｝(){}\[\]<>＜＞\-a-zA-Z0-9]/.test( c ) ) {
				g.save()
				g.translate( cx, cy )
				g.rotate( Math.PI / 2 )
				g.fillText( c, 0, 0 )
				g.restore()
			} else {
				g.fillText( c, cx, cy )
			}
		}
		g.restore()
	}

	//	ZH/ZV: full-width text, top-left anchored, one em per glyph.
	ZH( text, name, size, x, y ) {
		this._ZH( text, this.MakeFont( name, size ), size, x, y )
	}

	ZV( text, name, size, x, y ) {
		this._ZV( text, this.MakeFont( name, size ), size, x, y )
	}

	//	Centered at (x, y).
	CenterH( text, name, size, x, y ) {
		const
		g = this.g
		g.save()
		this.SetFont( this.MakeFont( name, size ) )
		g.textAlign = 'center'
		g.textBaseline = 'middle'
		g.fillText( text, x, y )
		g.restore()
	}

	CenterV( text, name, size, x, y ) {
		this._ZV( text, this.MakeFont( name, size ), size, x - size / 2, y - size * text.length / 2 )
	}

	ScaleCenterH( text, name, x, y, xScale, yScale ) {
		const
		g = this.g
		g.save()
		g.translate( x, y )
		g.scale( xScale, yScale )
		this.CenterH( text, name, 1, 0, 0 )
		g.restore()
	}

	ScaleCenterV( text, name, x, y, xScale, yScale ) {
		const
		g = this.g
		g.save()
		g.translate( x, y )
		g.scale( xScale, yScale )
		this.CenterV( text, name, 1, 0, 0 )
		g.restore()
	}

	ScaleZH( text, name, x, y, xScale, yScale ) {
		const
		g = this.g
		g.save()
		g.translate( x, y )
		g.scale( xScale, yScale )
		this.ZH( text, name, 1, 0, 0 )
		g.restore()
	}

	ScaleZV( text, name, x, y, xScale, yScale ) {
		const
		g = this.g
		g.save()
		g.translate( x, y )
		g.scale( xScale, yScale )
		this.ZV( text, name, 1, 0, 0 )
		g.restore()
	}

	//	Fill*: squeeze/stretch text to exactly `fit`.
	FillZH( text, name, size, x, y, fit ) {
		if ( !text.length ) return
		const
		g = this.g
		g.save()
		g.translate( x, y )
		g.scale( fit / ( text.length * size ), 1 )
		this._ZH( text, this.MakeFont( name, size ), size, 0, 0 )
		g.restore()
	}

	FillZV( text, name, size, x, y, fit ) {
		if ( !text.length ) return
		const
		g = this.g
		g.save()
		g.translate( x, y )
		g.scale( 1, fit / ( text.length * size ) )
		this._ZV( text, this.MakeFont( name, size ), size, 0, 0 )
		g.restore()
	}

	//	Fit*: letter-space out to `fit` when short, squeeze when long.
	FitZH( text, name, size, x, y, fit ) {
		const
		font = this.MakeFont( name, size )
	,	width = text.length * size
		if ( width <= fit ) {
			if ( !text.length ) return
			if ( text.length === 1 ) return this._ZH( text, font, size, x + ( fit - size ) / 2, y )
			const
			gap = ( fit - width ) / ( text.length - 1 )
			for ( let i = 0; i < text.length; i++ ) this._ZH( text[ i ], font, size, x + i * ( size + gap ), y )
		} else {
			const
			g = this.g
			g.save()
			g.translate( x, y )
			g.scale( fit / width, 1 )
			for ( let i = 0; i < text.length; i++ ) this._ZH( text[ i ], font, size, i * size, 0 )
			g.restore()
		}
	}

	FitZV( text, name, size, x, y, fit ) {
		const
		font = this.MakeFont( name, size )
	,	height = text.length * size
		if ( height <= fit ) {
			if ( !text.length ) return
			if ( text.length === 1 ) return this._ZV( text, font, size, x, y + ( fit - size ) / 2 )
			const
			gap = ( fit - height ) / ( text.length - 1 )
			for ( let i = 0; i < text.length; i++ ) this._ZV( text[ i ], font, size, x, y + i * ( size + gap ) )
		} else {
			const
			g = this.g
			g.save()
			g.translate( x, y )
			g.scale( 1, fit / height )
			for ( let i = 0; i < text.length; i++ ) this._ZV( text[ i ], font, size, 0, i * size )
			g.restore()
		}
	}

	ZVorFitZV( text, name, size, x, y, height ) {
		size * text.length > height - y
		?	this.FitZV( text, name, size, x, y, height - y )
		:	this.FitZV( text, name, size, x, y, size * text.length * 0.99 )
	}

	//	Two half-width glyphs in one em, horizontally.
	HD( text, name, size, x, y ) {
		const
		g = this.g
	,	font = this.MakeFont( name, size )
		g.save()
		g.translate( x, y )
		g.scale( 0.5, 1 )
		this._ZH( text[ 0 ], font, size, 0, 0 )
		this._ZH( text[ 1 ], font, size, size, 0 )
		g.restore()
	}

	//	Two glyphs in one em, vertically.
	VD( text, name, size, x, y ) {
		const
		g = this.g
	,	font = this.MakeFont( name, size )
		g.save()
		g.translate( x, y )
		g.scale( 1, 0.5 )
		this._ZV( text[ 0 ], font, size, 0, 0 )
		this._ZV( text[ 1 ], font, size, 0, size )
		g.restore()
	}

	//	Four glyphs in one em: 12 / 34.
	HQ( text, name, size, x, y ) {
		const
		g = this.g
	,	font = this.MakeFont( name, size )
		g.save()
		g.translate( x, y )
		g.scale( 0.5, 0.5 )
		this._ZH( text[ 0 ], font, size, 0, 0 )
		this._ZH( text[ 1 ], font, size, size, 0 )
		this._ZH( text[ 2 ], font, size, 0, size )
		this._ZH( text[ 3 ], font, size, size, size )
		g.restore()
	}

	//	Four glyphs in one em: 13 / 24 (vertical order).
	VQ( text, name, size, x, y ) {
		const
		g = this.g
	,	font = this.MakeFont( name, size )
		g.save()
		g.translate( x, y )
		g.scale( 0.5, 0.5 )
		this._ZV( text[ 0 ], font, size, 0, 0 )
		this._ZV( text[ 1 ], font, size, 0, size )
		this._ZV( text[ 2 ], font, size, size, 0 )
		this._ZV( text[ 3 ], font, size, size, size )
		g.restore()
	}

	ZDiag3( text, name, size, x, y ) {
		const
		g = this.g
	,	font = this.MakeFont( name, size )
		g.save()
		g.translate( x, y )
		g.scale( 0.4, 0.4 )
		this._ZH( text[ 0 ], font, size, 0, 0 )
		this._ZH( text[ 1 ], font, size, size * 0.75, size * 0.75 )
		this._ZH( text[ 2 ], font, size, size * 1.5, size * 1.5 )
		g.restore()
	}

	ZH21( text, name, size, x, y ) {
		const
		g = this.g
	,	font = this.MakeFont( name, size )
		g.save()
		g.translate( x, y )
		g.scale( 0.5, 0.5 )
		this._ZH( text[ 0 ], font, size, 0, 0 )
		this._ZH( text[ 1 ], font, size, size, 0 )
		this._ZH( text[ 2 ], font, size, size * 0.5, size )
		g.restore()
	}

	ZV21( text, name, size, x, y ) {
		const
		g = this.g
	,	font = this.MakeFont( name, size )
		g.save()
		g.translate( x, y )
		g.scale( 0.5, 0.5 )
		this._ZV( text[ 0 ], font, size, 0, 0 )
		this._ZV( text[ 1 ], font, size, 0, size )
		this._ZV( text[ 2 ], font, size, size, size * 0.5 )
		g.restore()
	}

	//	"1".."19" squeezed into one em.
	Dig2ZH( text, name, size, x, y ) {
		const
		font = this.MakeFont( name, size )
		if ( text.length === 1 ) return this._ZH( text, font, size, x, y )
		const
		g = this.g
		g.save()
		g.translate( x, y )
		g.scale( 2 / 3, 1 )
		this._ZH( text[ 0 ], font, size, size / -6, 0 )
		this._ZH( text[ 1 ], font, size, size / 3, 0 )
		g.restore()
	}

	CtoS( p )			{ return String.fromCharCode( p ) }
	NumberCircle( p )	{ return this.CtoS( 0x245f + p ) }
	NumberCircleR( p )	{ return this.CtoS( ( p > 10 ? 0x24e0 : 0x2775 ) + p ) }
	NumberRect( p )		{ return this.CtoS( 0x2473 + p ) }
	NumberRectR( p )	{ return this.CtoS( 0x2487 + p ) }
	U100( p )			{ return this.CtoS( 0x2500 + p ) }
	NinkiU3( p )		{ return this.CtoS( 0x2794 + p ) }
	Tsuka( furi, p )	{ return this.CtoS( ( furi ? 0x2626 : 0x2606 ) + p ) }
}

//	Print helper: turn page canvases into <img> pages and window.print() them.
//	Pair with shared/print.css (@page size A4, one img per page).
export const
PrintCanvases = canvases => {
	const
	holder = document.createElement( 'div' )
	holder.className = 'print-pages'
	for ( const canvas of canvases ) {
		const
		img = document.createElement( 'img' )
		img.src = canvas.toDataURL( 'image/png' )
		holder.appendChild( img )
	}
	document.body.appendChild( holder )
	const
	Cleanup = () => { holder.remove(); window.removeEventListener( 'afterprint', Cleanup ) }
	window.addEventListener( 'afterprint', Cleanup )
	//	Give the images a beat to decode before printing.
	Promise.all( [ ...holder.querySelectorAll( 'img' ) ].map( img => img.decode() ) ).then( () => window.print() )
}
