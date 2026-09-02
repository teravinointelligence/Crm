import json, re
raw=json.load(open('vc_all.json'))
# rp_label -> (key, labelEs, rpName)
M=[
 ("BORDEAUX: ST JULIEN/PAUILLAC/ST ESTEPHE","bordeaux-medoc-north","Burdeos · St-Julien / Pauillac / St-Estèphe","Bordeaux: St Julien/Pauillac/St Estèphe"),
 ("BORDEAUX: GRAVES/PESSAC LEOGNAN","bordeaux-graves","Burdeos · Graves / Pessac-Léognan","Bordeaux: Graves/Pessac-Léognan"),
 ("BORDEAUX: ST EMILION","bordeaux-st-emilion","Burdeos · St-Émilion","Bordeaux: St-Émilion"),
 ("BORDEAUX: BARSAC/SAUTERNES","bordeaux-sauternes","Burdeos · Barsac / Sauternes","Bordeaux: Barsac/Sauternes"),
 ("BURGUNDY: COTE DE NUITS (RED)","burgundy-nuits-red","Borgoña · Côte de Nuits (tinto)","Burgundy: Côte de Nuits (Red)"),
 ("BURGUNDY: COTE DE BEAUNE (RED)","burgundy-beaune-red","Borgoña · Côte de Beaune (tinto)","Burgundy: Côte de Beaune (Red)"),
 ("BURGUNDY (WHITE)","burgundy-white","Borgoña (blanco)","Burgundy (White)"),
 ("BURGUNDY: BEAUJOLAIS","beaujolais","Beaujolais","Burgundy: Beaujolais"),
 ("CHAMPAGNE","champagne","Champagne","Champagne"),
 ("ALSACE","alsace","Alsacia","Alsace"),
 ("LOIRE VALLEY (WHITE)","loire-white","Valle del Loira (blanco)","Loire Valley (White)"),
 ("RHONE: COTE ROTIE/HERMITAGE","rhone-north","Ródano norte · Côte-Rôtie / Hermitage","Rhône: Côte Rôtie/Hermitage"),
 ("LANGUEDOC","languedoc","Languedoc","Languedoc"),
 ("PIEDMONT: BAROLO","piedmont-barolo","Piamonte · Barolo","Piedmont: Barolo"),
 ("PIEDMONT: BARBARESCO","piedmont-barbaresco","Piamonte · Barbaresco","Piedmont: Barbaresco"),
 ("FRIULI VENEZIA GIULIA: COLLIO (WHITES)","friuli-collio","Friuli · Collio (blancos)","Friuli Venezia Giulia: Collio (Whites)"),
 ("SICILY: ETNA ROSSO","sicily-etna","Sicilia · Etna Rosso","Sicily: Etna Rosso"),
 ("RIOJA","rioja","Rioja","Rioja"),
 ("CASTILLA LEÓN: RIBERA DEL DUERO","ribera-duero","Ribera del Duero","Castilla León: Ribera del Duero"),
 ("GALICIA","galicia","Galicia (Rías Baixas)","Galicia"),
 ("NORTH COAST CABERNET SAUVIGNON","us-north-cab","California · North Coast · Cabernet","North Coast Cabernet Sauvignon"),
 ("NORTH COAST CHARDONNAY","us-north-chard","California · North Coast · Chardonnay","North Coast Chardonnay"),
 ("NORTH COAST ZINFANDEL","us-north-zin","California · North Coast · Zinfandel","North Coast Zinfandel"),
 ("NORTH COAST PINOT NOIR","us-north-pinot","California · North Coast · Pinot Noir","North Coast Pinot Noir"),
 ("CENTRAL COAST: PASO ROBLES","us-paso-robles","California · Paso Robles","Central Coast: Paso Robles"),
 ("CENTRAL COAST: SANTA BARBARA","us-central-coast","California · Central Coast (Santa Barbara)","Central Coast: Santa Barbara"),
 ("WILLAMETTE VALLEY PINOT NOIR AND CHARDONNAY","us-willamette","Oregon · Willamette Valley","Willamette Valley Pinot Noir & Chardonnay"),
 ("ARGENTINA","argentina","Argentina (Mendoza)","Argentina"),
 ("SOUTH AUSTRALIA: BAROSSA MCLAREN VALE","au-barossa","Australia · Barossa / McLaren Vale","South Australia: Barossa/McLaren Vale"),
 ("NEW ZEALAND","new-zealand","Nueva Zelanda","New Zealand"),
 ("SOUTH AFRICA","south-africa","Sudáfrica","South Africa"),
]
YEARS=[str(y) for y in range(2000,2026)]
CELL=re.compile(r'^(\d{2,3})(-(\d{2,3}))?([A-Z]{1,2})?$')
data={}; meta=[]
for rp,key,es,rpname in M:
    if rp not in raw:
        print("MISSING", rp); continue
    row=raw[rp]; keep={}
    for y in YEARS:
        c=row.get(y,'')
        if not c or c in ('·','NT','NV','NR',''): continue
        if not CELL.match(c):  # skip anything unexpected
            print("ODD cell",key,y,repr(c)); continue
        keep[y]=c
    data[key]=keep
    meta.append({"key":key,"labelEs":es,"rpName":rpname})
json.dump({"data":data,"meta":meta}, open('vc_final.json','w'), ensure_ascii=False)
# report coverage
print("keys:",len(data))
for m in meta:
    yrs=sorted(data[m['key']])
    print(f"  {m['key']:20s} {len(yrs):2d} añadas  {yrs[0] if yrs else '-'}–{yrs[-1] if yrs else '-'}")
