import pdfplumber, re, json
PATH='/Users/sabrina/Desktop/VintageChart_print.pdf'
pdf=pdfplumber.open(PATH)

def cluster(tokens, key, tol):
    tokens=sorted(tokens,key=key)
    lines=[]; cur=[]
    for t in tokens:
        if not cur or key(t)-key(cur[-1])<=tol:
            cur.append(t)
        else:
            lines.append(cur); cur=[t]
    if cur: lines.append(cur)
    return lines

def extract_page(page, want_years):
    words=page.extract_words(keep_blank_chars=False)
    ycent={}
    for w in words:
        if 57<w['top']<64 and re.fullmatch(r'(19|20)\d\d', w['text']):
            ycent[int(w['text'])]=(w['x0']+w['x1'])/2
    years=sorted(ycent,key=lambda y:ycent[y]); xs=[ycent[y] for y in years]
    def col(xc):
        d=[abs(xc-x) for x in xs]; i=d.index(min(d))
        return i if d[i]<12 else None
    labels=[w for w in words if w['x1']<184 and re.search(r'[A-Za-zÀ-ÿ]', w['text']) and 70<w['top']<560]
    vals=[w for w in words if w['x0']>=184 and 70<w['top']<560 and not re.fullmatch(r'(19|20)\d\d', w['text'])]
    # label lines
    llines=cluster(labels,lambda w:w['top'],4)
    lab_entries=[]
    for ln in llines:
        ln=sorted(ln,key=lambda w:w['x0'])
        top=min(w['top'] for w in ln)
        text=" ".join(w['text'] for w in ln)
        lab_entries.append([top,text])
    # merge wrapped labels (gap<12) -> region anchors
    lab_entries.sort()
    regions=[]
    for top,text in lab_entries:
        if regions and top-regions[-1][2]<12:
            regions[-1][1]+=" "+text; regions[-1][2]=top
        else:
            regions.append([top,text,top])  # bandtop, text, lasttop
    # bands
    out=[]
    for i,(bt,text,lt) in enumerate(regions):
        lo=bt-6
        hi=regions[i+1][0]-6 if i+1<len(regions) else 560
        cells={}
        for w in vals:
            if lo<=w['top']<hi:
                c=col((w['x0']+w['x1'])/2)
                if c is None: continue
                cells.setdefault(c,[]).append(w)
        row={}
        for c,ts in cells.items():
            ts=sorted(ts,key=lambda w:w['top'])
            row[years[c]]="".join(t['text'] for t in ts)
        out.append((re.sub(r'\s+',' ',text).strip(), row))
    return years,out

years,out=extract_page(pdf.pages[0], None)
for lab,row in out:
    seq=" ".join(row.get(y,'·') for y in years)
    print(f"{lab[:44]:44s} | {seq}")

# --- dump all 2000-2025 pages (odd indices 0,2,4,6) ---
if __name__=="__main__":
    allrows={}
    for idx in [0,2,4,6]:
        yrs,rows=extract_page(pdf.pages[idx],None)
        for lab,row in rows:
            if not row: continue
            allrows[lab]={str(y):row[y] for y in yrs if y in row}
    json.dump(allrows, open('vc_all.json','w'), ensure_ascii=False, indent=0)
    print("REGIONS:", len(allrows))
    for k in allrows: print(" -", k)
