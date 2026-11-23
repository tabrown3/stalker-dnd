"""Prototype of the attack/damage math used to generate docs/worked-examples.md.

Not part of the app (the real engine will be TypeScript). Run it to regenerate
the example numbers after a rule changes:  python scripts/worked_examples.py
Rules and assumptions are documented in STALKER_TTRPG_NOTES.md (section 3).
"""
import math
TIER={'9x19mm':1,'9x18mm':1,'.45 ACP':2,'12x70mm':2,'5.45x39mm':3,'5.56x45mm':3,'7.62x39mm':3,
 '7.62x54mmR':4,'7.62x51mm':4,'9x39mm':5,'6.8x51mm':5,'12.7x55mm':9,'PG-7VL':9,'72.5mm Rocket':9}
LV={'II':1,'IIIA':2,'III':3,'III+':4,'IV':5}; AC={None:10,'II':11,'IIIA':12,'III':13,'III+':14,'IV':15}
BURST_MAX=6  # [CONFIRMED 2026-11-22] 1 round = single, 2..BURST_MAX = burst, more = full auto
def fire_mod(fired):
    # Fire mode is a consequence of rounds fired on one trigger pull [CONFIRMED]
    return 1 if fired==1 else 0 if fired<=BURST_MAX else -1
def attack(name,cal,vel,wap,ammo,level,phys,d20,rmod,gpmg,fired,rolls):
    """One trigger pull: one to-hit roll, `fired` rounds."""
    ac=AC[level]; ap=wap if ammo=='AP' else 0
    eac=ac-ap if level else ac
    fmod=fire_mod(fired)
    hit=d20+rmod+fmod+gpmg; m=hit-eac; rh=max(0,min(fired,m//2))
    print(f'== {name}: AC {ac} eff {eac} toHit {d20}{rmod:+}{fmod:+}{gpmg:+}={hit} margin {m} rounds {rh}/{fired}')
    tot=0
    for r in rolls[:rh]:
        d=sum(r)
        if not level: t=d; step='none'
        else:
            a,b=TIER[cal],LV[level]
            if a<b: t=math.ceil(d/2); step='lower'
            elif a==b: t=d-math.ceil(d*0.25); step='equal'
            else: t=d; step='higher'
        p=t-math.ceil(t*phys/100) if level else t
        hp=4 if ammo=='HP' else 0
        dmg=p+vel+hp+ap; tot+=dmg
        print(f'  dice {r}={d} {step}->{t} prot{phys}%->{p} +vel{vel} +hp{hp} +ap{ap} = {dmg}')
    print('  total',tot)
    return tot
attack('1 Glock unarmored','9x19mm',2,2,'N',None,0,15,2,0,1,[(12,)])
attack('2 M9 vs PSZ-5D','9x19mm',2,2,'N','III',46,17,0,0,1,[(15,)])
attack('3 AK-74 burst vs PSZ-5D','5.45x39mm',3,4,'N','III',46,17,0,0,3,[(14,6),(8,3),(2,1)])
attack('4 AK-74 AP burst vs PSZ-5D','5.45x39mm',3,4,'AP','III',46,17,0,0,3,[(14,6),(8,3),(2,1)])
attack('5 SVD vs Sunrise','7.62x54mmR',4,9,'N','IIIA',40,16,0,0,1,[(14,9,17)])
attack('6 Fort-12 vs Wind of Freedom','9x18mm',2,1,'N','II',22,11,0,0,1,[(9,)])
attack('7 SPAS-12 HP vs mask only','12x70mm',2,3,'HP',None,0,10,2,0,1,[(11,5,18,7)])
attack('8 RSh-12 vs Exoskeleton','12.7x55mm',1,12,'N','IV',65,18,0,0,1,[(13,16,4,10)])
attack('9 PKM unmounted full vs Recruit','7.62x54mmR',5,9,'N','II',24,20,-3,-2,30,[(9,12,15)])
attack('10 HK416 AP full vs Duty Armor','5.56x45mm',3,4,'AP','IV',70,17,0,0,10,[(13,9),(6,15)])
# 11: one turn, three trigger pulls of 1 round each (semi-auto: up to 6 pulls a turn)
t=0
t+=attack('11a Glock pull 1 vs Sunrise','9x19mm',2,2,'N','IIIA',40,16,0,0,1,[(18,)])
t+=attack('11b Glock pull 2 vs Sunrise','9x19mm',2,2,'N','IIIA',40,9,0,0,1,[])
t+=attack('11c Glock pull 3 vs Sunrise','9x19mm',2,2,'N','IIIA',40,19,0,0,1,[(7,)])
print('11 turn total',t)
