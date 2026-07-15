import React from 'react'
import { PROPERTIES, IMPROVE_TIERS, IMPROVE_COST_PCT, PROPERTY_SALES_TAX, LUXURY, LUXURY_RESALE } from '../game/data.js'
import { propertyRent } from '../game/engine.js'
import { fmt } from '../format.js'

// Booking-screen principle: sensory copy that "transports" the buyer beats a bare spec list.
const BLURB = {
  studio: 'A bright city pied-à-terre — never short of tenants.',
  suburb: 'Quiet street, two-car driveway, weekend barbecues.',
  loft: 'Exposed brick, skyline windows, downtown at your door.',
  villa: 'Wake to the surf; let it out while you sail.',
  block: 'Dozens of tenants, one deed, cheques every hour.',
  hotel: 'Boutique charm and five-star nightly rates.',
  tower: 'A glass landmark with your name on the lease.',
  resort: 'Your own island — guests pay for the privilege.',
}
const PRIME = new Set(['villa', 'resort']) // aspirational halo badge

export default function Estate({ state, dispatch }) {
  return (
    <>
      <div className="section-title">Real estate — hourly rent, {IMPROVE_TIERS} improvement tiers, zero upkeep · selling costs {PROPERTY_SALES_TAX * 100}% tax</div>
      <div className="bizlist">
        {PROPERTIES.map(p => <PropertyRow key={p.id} p={p} o={state.properties[p.id]} cash={state.cash} dispatch={dispatch} />)}
      </div>
      <div className="section-title">Luxury — zero income, resells at {LUXURY_RESALE * 100}% (NFTs at 100%) · the endgame flex</div>
      <div className="bizlist">
        {LUXURY.map(l => <LuxuryRow key={l.id} l={l} n={state.luxury[l.id] || 0} cash={state.cash} dispatch={dispatch} />)}
      </div>
    </>
  )
}

function PropertyRow({ p, o, cash, dispatch }) {
  if (!o) {
    const can = cash >= p.cost
    return (
      <div className={`bizrow ${can ? 'can' : 'cant'}`}>
        <span className="biz-icon">{p.icon}</span>
        <span className="biz-name">
          <b>{p.name}{PRIME.has(p.id) && <span className="proof best">★ Prime</span>}</b>
          <span>{BLURB[p.id] ? `${BLURB[p.id]} · ` : ''}rent {fmt(propertyRent(p, 0))}/hr</span>
        </span>
        <span className="biz-cost">{fmt(p.cost)}</span>
        <button className="btn buy small" disabled={!can} onClick={() => dispatch({ type: 'BUY_PROPERTY', id: p.id })}>Acquire</button>
      </div>
    )
  }
  const improveCost = p.cost * IMPROVE_COST_PCT
  const saleValue = p.cost * (1 + o.tier * IMPROVE_COST_PCT) * (1 - PROPERTY_SALES_TAX)
  const maxed = o.tier >= IMPROVE_TIERS
  return (
    <div className="bizrow owned">
      <span className="biz-icon">{p.icon}</span>
      <span className="biz-name">
        <b>{p.name} <span className="tierpips">{'●'.repeat(o.tier)}{'○'.repeat(IMPROVE_TIERS - o.tier)}</span></b>
        <span className="up">{fmt(propertyRent(p, o.tier))}/hr rent</span>
      </span>
      <button className="btn small" disabled={maxed || cash < improveCost} onClick={() => dispatch({ type: 'IMPROVE_PROPERTY', id: p.id })}>
        {maxed ? 'Maxed' : `Improve · ${fmt(improveCost)}`}
      </button>
      <button className="btn small sell" onClick={() => dispatch({ type: 'SELL_PROPERTY', id: p.id })}>Sell · {fmt(saleValue)}</button>
    </div>
  )
}

function LuxuryRow({ l, n, cash, dispatch }) {
  const can = cash >= l.cost
  const resale = l.cost * (l.cat === 'NFT' ? 1 : LUXURY_RESALE)
  return (
    <div className={`bizrow ${n > 0 ? 'owned' : can ? 'can' : 'cant'}`}>
      <span className="biz-icon">{l.icon}</span>
      <span className="biz-name">
        <b>{l.name} {n > 0 && <span className="pill gold">×{n}</span>}</b>
        <span>{l.cat}{l.cat === 'NFT' ? ' · resells at full value' : ''}</span>
      </span>
      <span className="biz-cost">{fmt(l.cost)}</span>
      <span className="rowbtns">
        <button className="btn buy small" disabled={!can} onClick={() => dispatch({ type: 'BUY_LUXURY', id: l.id })}>Own it</button>
        {n > 0 && <button className="btn small sell" onClick={() => dispatch({ type: 'SELL_LUXURY', id: l.id })}>Sell · {fmt(resale)}</button>}
      </span>
    </div>
  )
}
