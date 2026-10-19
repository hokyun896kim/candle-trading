# 시총 순위표 생성: python3 scripts/build_ranks.py  → public/ranks.json
import requests, json, datetime
H={'User-Agent':'Mozilla/5.0'}
out={}
for mkt,pages in (('KOSPI',12),('KOSDAQ',12)):
    rank=0
    for p in range(1,pages+1):
        j=requests.get(f'https://m.stock.naver.com/api/stocks/marketValue/{mkt}?page={p}&pageSize=100',headers=H,timeout=30).json()
        for s in j['stocks']:
            rank+=1
            out[s['itemCode']]={'m':mkt,'r':rank,'n':s['stockName']}
        if len(j['stocks'])<100: break
json.dump({'asof':datetime.date.today().isoformat(),'ranks':out},open('public/ranks.json','w'),ensure_ascii=False,separators=(',',':'))
print('ranks',len(out))
