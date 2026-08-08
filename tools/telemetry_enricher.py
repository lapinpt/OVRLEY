#!/usr/bin/env python3
"""Enrich RaceChrono/Torque CSV exports without modifying their source data."""
import argparse, csv, math, statistics
from dataclasses import dataclass
from pathlib import Path

CURVE=[(0,0),(1500,25),(3000,42),(4500,55),(6000,60),(7500,58),(9500,50.26),(10000,45)]
RATIOS={1:2.353,2:1.714,3:1.333,4:1.111,5:.966,6:.852}; PRIMARY=2.095; FINAL=3.2
@dataclass(frozen=True)
class NormalizedHeader:
 original:str; base:str; source:str
def normalized_header(header):
 text=' '.join(header.strip().lower().split()); source='none'
 for suffix in ('*obd','*gps','*calc'):
  if text.endswith(suffix): text=text[:-len(suffix)].rstrip(); source=suffix[1:]; break
 return NormalizedHeader(header,text,source)
def find(headers, names, preferred=()):
 parsed=[normalized_header(h) for h in headers]
 for source in preferred+('none','gps','calc','unknown'):
  for h in parsed:
   if h.source==source and any(alias in h.base for alias in names): return h
 return None
def ranked(headers, terms):
 choices=[]
 for h in map(normalized_header,headers):
  if not any(t in h.base for t in terms): continue
  obd=h.source=='obd' or '(obd)' in h.base or ' obd' in h.base
  gps=h.source=='gps' or '(gps)' in h.base or h.base.startswith('gps ')
  choices.append((100 if obd else 60 if gps else 20,h))
 return max(choices,key=lambda x:x[0])[1] if choices else None
def number(v):
 try:
  x=float((v or '').strip()); return x if math.isfinite(x) else None
 except ValueError: return None
def clamp(value, minimum, maximum):
 return max(minimum,min(value,maximum))
def normalize_throttle(raw_throttle, raw_min=8.0, raw_max=92.0):
 if raw_throttle is None: return None
 if raw_max<=raw_min: raise ValueError('throttle maximum must exceed throttle minimum')
 return clamp((raw_throttle-raw_min)/(raw_max-raw_min)*100.0,0.0,100.0)
def curve(r):
 if r is None or r<0 or r>CURVE[-1][0]: return None
 for (a,x),(b,y) in zip(CURVE,CURVE[1:]):
  if r<=b:return x+(y-x)*(r-a)/(b-a)
 return CURVE[-1][1]
def circumference(args):
 return args.tyre_circumference_m or math.pi*((17*.0254)+2*.150*.70)
def speed_mps(v,h):
 h=h.lower()
 return v if 'm/s' in h else v*.44704 if 'mph' in h else v/3.6
def discover(path):
 raw=path.read_text(encoding='utf-8-sig',newline='') if False else path.read_text(encoding='utf-8-sig')
 lines=raw.splitlines(keepends=True); sample=''.join(lines[:40])
 try: dialect=csv.Sniffer().sniff(sample,delimiters=',;\t')
 except csv.Error: dialect=csv.excel
 for i,line in enumerate(lines):
  cells=next(csv.reader([line],dialect)); base=[normalized_header(x).base for x in cells]
  timing=any(x in ('time (s)','elapsed time (s)','elapsed time','trip time','gps time','device time','timestamp') or x.startswith('time ') for x in base)
  metrics=any(any(k in x for k in ('rpm','speed','latitude','longitude','engine load','absolute load')) for x in base)
  if timing and metrics and len(cells)>3: return lines[:i],cells,lines[i+1:],dialect,i+1
 raise ValueError('telemetry table header not found')
def main():
 p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('--output');p.add_argument('--overwrite-derived',action='store_true');p.add_argument('--gear-error-threshold',type=float,default=.12);p.add_argument('--min-gear-speed',type=float,default=8);p.add_argument('--tyre-circumference-m',type=float);p.add_argument('--throttle-min',type=float,default=8.0);p.add_argument('--throttle-max',type=float,default=92.0);p.add_argument('--verbose',action='store_true');p.add_argument('--stats',action='store_true');p.add_argument('--dry-run',action='store_true');p.add_argument('--profile',default='cfmoto-700mt-adv-cf693');args=p.parse_args()
 if args.throttle_max<=args.throttle_min: p.error('--throttle-max must be greater than --throttle-min')
 src=Path(args.input);out=Path(args.output) if args.output else src.with_name(src.stem+'_enriched.csv')
 preamble,headers,data_lines,dialect,header_line=discover(src)
 rows=list(csv.DictReader(data_lines,fieldnames=headers,dialect=dialect))
 legacy_normalized_throttle='Normalized Throttle (%)'
 if legacy_normalized_throttle in headers:
  headers=[header for header in headers if header!=legacy_normalized_throttle]
  for row in rows: row.pop(legacy_normalized_throttle,None)
 cols={'rpm':ranked(headers,['rpm','engine rpm']),'speed':ranked(headers,['speed']),'absolute_load':ranked(headers,['absolute load','engine load(absolute)']),'engine_load':ranked(headers,['engine load']),'throttle':ranked(headers,['throttle position','relative throttle position','throttle_pos'])}
 rpmcol=cols['rpm'].original if cols['rpm'] else None; speedcol=cols['speed'].original if cols['speed'] else None; loadcol=(cols['absolute_load'] or cols['engine_load']); loadcol=loadcol.original if loadcol else None
 if args.verbose: print(f'Detected format: {"RaceChrono CSV" if preamble else "CSV"}\nPreamble lines: {len(preamble)}\nHeader line: {header_line}\nDelimiter: {dialect.delimiter}')
 if not rpmcol or not speedcol or not loadcol: raise SystemExit(f'missing required columns: {cols}')
 derived=['Estimated Torque (Nm)','Estimated Power (kW)','Estimated Power (CV)','Estimated Gear']; add=[x for x in derived if x not in headers]; write_derived=set(derived if args.overwrite_derived else add)
 last=None; pending=None; count=0; errors={g:[] for g in RATIOS}; gears=[]
 raw_throttles=[]; adjusted_throttles=[]; throttle_at_or_below_min=0; throttle_at_or_above_max=0
 for row in rows:
  rpm=number(row[rpmcol]); speed=number(row[speedcol]); load=number(row[loadcol]); nominal=curve(rpm); torque=None
  if nominal is not None and load is not None and 0<=load<=100: torque=nominal*load/100
  kw=None if torque is None else torque*rpm*2*math.pi/60/1000; cv=None if kw is None else kw*1.3596216173039
  raw_throttle=number(row[cols['throttle'].original]) if cols['throttle'] else None
  adjusted_throttle=normalize_throttle(raw_throttle,args.throttle_min,args.throttle_max)
  if raw_throttle is not None:
   raw_throttles.append(raw_throttle)
   throttle_at_or_below_min+=raw_throttle<=args.throttle_min
   throttle_at_or_above_max+=raw_throttle>=args.throttle_max
  if adjusted_throttle is not None: adjusted_throttles.append(adjusted_throttle)
  if cols['throttle']:
   row[cols['throttle'].original]='' if adjusted_throttle is None else f'{adjusted_throttle:.6f}'
  candidate=None; best=None
  if rpm and speed is not None and speed_mps(speed,speedcol)>=args.min_gear_speed:
   s=speed_mps(speed,speedcol); vals=[(abs(rpm-(s*60*PRIMARY*r*FINAL/circumference(args)))/rpm,g,s*60*PRIMARY*r*FINAL/circumference(args)) for g,r in RATIOS.items()]; best=min(vals)
   if best[0]<=args.gear_error_threshold: candidate=best[1]
  final=candidate
  if candidate!=last and candidate is not None:
   pending = candidate if pending==candidate else candidate; count=count+1 if pending==candidate else 1
   if last is not None and count<3 and (best is None or best[0]>.04): final=last
  else: count=0
  if final is not None: last=final; gears.append(final); errors[final].append(best[0])
  for k,v in [('Estimated Torque (Nm)',torque),('Estimated Power (kW)',kw),('Estimated Power (CV)',cv),('Estimated Gear',final)]:
   if k in write_derived: row[k]='' if v is None else (str(v) if k=='Estimated Gear' else f'{v:.6f}')
  if args.verbose: print(rpm,speed,candidate,None if best is None else round(best[2],1),None if best is None else round(best[0],3),final)
 if args.stats: print({
  'rows':len(rows),'aliases':cols,'accepted':len(gears),'rejected':len(rows)-len(gears),
  'gear_distribution':{g:gears.count(g) for g in RATIOS},
  'mean_error':{g:statistics.mean(v) if v else None for g,v in errors.items()},
  'transitions':sum(a!=b for a,b in zip(gears,gears[1:])),
  'raw_throttle_min':min(raw_throttles) if raw_throttles else None,
  'raw_throttle_max':max(raw_throttles) if raw_throttles else None,
  'adjusted_throttle_min':min(adjusted_throttles) if adjusted_throttles else None,
  'adjusted_throttle_max':max(adjusted_throttles) if adjusted_throttles else None,
  'throttle_samples_at_or_below_min':throttle_at_or_below_min,
  'throttle_samples_at_or_above_max':throttle_at_or_above_max,
 })
 if not args.dry_run:
  with out.open('w',newline='',encoding='utf-8') as f:
   f.writelines(preamble);w=csv.DictWriter(f,fieldnames=headers+add,dialect=dialect);w.writeheader();w.writerows(rows)
if __name__=='__main__': main()
