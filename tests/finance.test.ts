import assert from 'node:assert/strict'
import test from 'node:test'
import { budgetSpent, expenseEuroMinor, financeSummary, financeTotals, historicalEuroMinor, toMinorUnits } from '../src/finance'
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

test('keeps family and destination budget balances separate and calculates elapsed and remaining day figures', () => {
  const current = {
    ...state(), budget: 1_000,
    budgets: [
      { id: 'total', scope: 'total' as const, qualifier: '', amountMinor: 120_000 },
      { id: 'destination', scope: 'destination' as const, qualifier: '', amountMinor: 80_000 },
    ],
    expenses: [
      { ...expense, id: 'prepaid', currency: 'EUR' as const, amount: 100, amountMinor: 10_000, eurMinor: 10_000, phase: 'prepaid' as const },
      { ...expense, id: 'destination', amountMinor: 10_000, eurMinor: 6_800 },
    ],
  }
  const summary = financeSummary(current, new Date('2026-12-05T12:00:00+08:00'))
  assert.equal(summary.totalBudgetMinor, 120_000)
  assert.equal(summary.destinationBudgetMinor, 80_000)
  assert.equal(summary.totalRemaining, 103_200)
  assert.equal(summary.destinationRemaining, 73_200)
  assert.equal(summary.daysElapsed, 2)
  assert.equal(summary.daysRemaining, 7)
  assert.equal(summary.averagePerElapsedDay, 3_400)
  assert.equal(summary.availablePerDay, Math.floor(73_200 / 7))
})

test('reports unquoted movements as pending, then revalues them when a rate is added', () => {
  const unquoted = { ...state(), expenses: [{ ...expense, eurMinor: null, rate: null }] }
  const pending = financeTotals(unquoted)
  assert.equal(pending.pending, 1)
  assert.equal(pending.pendingByCurrency.get('SGD'), 1025)
  assert.equal(pending.total, 0)
  assert.equal(financeTotals({ ...unquoted, rates: { SGD: 0.7, MYR: null } }).pending, 0)
  assert.equal(expenseEuroMinor({ ...expense, bankEurMinor: 800 }, unquoted.rates), 800)
})

test('cash refunds and fees retain their historical euro values', () => {
  const current = {
    ...state(), cash: [{ id: 'refund-1', date: '2026-12-05', time: '12:00', currency: 'SGD' as const, kind: 'refund' as const, amountMinor: 1_000, feeMinor: 100, feeEurMinor: 68, eurMinor: 700, rate: 0.7, notes: '' }],
  }
  assert.equal(financeTotals(current).total, -632)
  assert.equal(budgetSpent(current, { id: 'b', scope: 'destination', qualifier: '', amountMinor: 10_000 }), -632)
})
