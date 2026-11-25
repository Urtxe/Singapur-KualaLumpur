import assert from 'node:assert/strict'
import test from 'node:test'
import { budgetSpent, expenseEuroMinor, financeTotals, historicalEuroMinor, toMinorUnits } from '../src/finance'
import { createInitialState } from '../src/state'
import { baseActivities } from '../src/data'
import type { Budget, Expense, State } from '../src/types'

function state(): State {
  return createInitialState(baseActivities, [])
}

const expense: Expense = {
  id: 'food-1', date: '2026-12-05', time: '13:15', title: 'Almuerzo', amount: 10.25, amountMinor: 1025,
  currency: 'SGD', category: 'Restaurantes', city: 'sg', payer: 'Mikel', method: 'cash', people: 5,
  rate: 0.68, eurMinor: 697, phase: 'destination', activityId: '', receiptId: '', notes: '',
}

test('stores money in integer minor units and converts using explicit historical rates', () => {
  assert.equal(toMinorUnits('10,25'), 1025)
  assert.throws(() => toMinorUnits('-0.01'))
  assert.equal(historicalEuroMinor(1025, 'SGD', 0.68), 697)
  assert.equal(historicalEuroMinor(199, 'EUR', null), 199)
})

test('uses each expense’s saved EUR equivalent when current rates change', () => {
  const current = { ...state(), expenses: [expense], rates: { SGD: 0.9, MYR: 0.2 } }
  assert.equal(expenseEuroMinor(expense, current.rates), 697)
  const totals = financeTotals(current)
  assert.equal(totals.total, 697)
  assert.equal(totals.destination, 697)
  assert.equal(totals.byCity.get('sg'), 697)
})

test('budget scopes match the intended expenses', () => {
  const current = { ...state(), expenses: [expense, { ...expense, id: 'prepaid', phase: 'prepaid' as const, city: 'kl' as const, category: 'Vuelos' }] }
  const cityBudget: Budget = { id: 'b1', scope: 'city', qualifier: 'sg', amountMinor: 20_000 }
  const destinationBudget: Budget = { id: 'b2', scope: 'destination', qualifier: '', amountMinor: 20_000 }
  const categoryBudget: Budget = { id: 'b3', scope: 'category', qualifier: 'Restaurantes', amountMinor: 20_000 }
  assert.equal(budgetSpent(current, cityBudget), 697)
  assert.equal(budgetSpent(current, destinationBudget), 697)
  assert.equal(budgetSpent(current, categoryBudget), 697)
})

test('cash handling fees count as costs while withdrawals and exchanges do not', () => {
  const current = {
    ...state(),
    expenses: [expense],
    cash: [{ id: 'cash-1', date: '2026-12-05', time: '10:00', currency: 'SGD' as const, kind: 'withdrawal' as const, amountMinor: 20_000, feeMinor: 300, feeEurMinor: 204, notes: '' }],
  }
  assert.equal(financeTotals(current).total, 901)
})
