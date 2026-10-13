import test from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../src/lib/storage.js';

function localStore(t, entries = {}) {
  const values = new Map(Object.entries(entries));
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'localStorage', previous) : delete globalThis.localStorage);
  return values;
}

test('legacy day choice is retained once, then koi and coast remember independent choices after restart', t => {
  assert.equal(typeof storage.loadThemeDays, 'function');
  localStore(t);
  const migrated = storage.loadThemeDays('night');
  assert.deepEqual(migrated, {koi:'night',coast:'night'});
  assert.equal(storage.saveThemeDays(storage.updateThemeDay(migrated,'coast','day')),true);
  assert.deepEqual(storage.loadThemeDays('auto'), {koi:'night',coast:'day'});
  assert.equal(storage.saveThemeDays(storage.updateThemeDay(storage.loadThemeDays('night'),'koi','auto')),true);
  assert.deepEqual(storage.loadThemeDays('day'), {koi:'auto',coast:'day'});
});

test('theme day changes preserve global preferences and independent cat and caiyuan saves', t => {
  assert.equal(typeof storage.loadThemeDays, 'function');
  const records = {
    'fusheng-settings': JSON.stringify({day:'night',sound:true,volume:.27,weather:'rainy',season:'spring'}),
    'mofish-cats-v1': JSON.stringify({version:1,environment:{time:'day'},cats:[{id:'pet'}]}),
    'mofish-caiyuan-v1': JSON.stringify({version:3,settings:{time:'dusk'},items:[{id:'wish',x:.2,y:.85}]}),
  };
  const values = localStore(t,records);
  const days = storage.loadThemeDays('night');
  const changed = storage.updateThemeDay(days,'koi','day');
  storage.saveThemeDays(changed);
  for (const [key,value] of Object.entries(records)) assert.equal(values.get(key),value);
  for (const theme of ['cats','caiyuan','unknown']) assert.deepEqual(storage.updateThemeDay(changed,theme,'night'),{koi:'day',coast:'night'});
  assert.deepEqual(days,{koi:'night',coast:'night'});
});

test('damaged per-theme fields repair independently without reapplying the legacy global choice', t => {
  assert.equal(typeof storage.loadThemeDays, 'function');
  const values = localStore(t,{'mofish-theme-day-v1':JSON.stringify({koi:'night',coast:'oops',cats:'night'})});
  assert.deepEqual(storage.loadThemeDays('day'),{koi:'night',coast:'auto'});
  values.set('mofish-theme-day-v1',JSON.stringify({coast:'day'}));
  assert.deepEqual(storage.loadThemeDays('night'),{koi:'auto',coast:'day'});
  for (const value of ['[]','"night"','42','{oops']) {
    values.set('mofish-theme-day-v1',value);
    assert.deepEqual(storage.loadThemeDays('night'),{koi:'auto',coast:'auto'});
  }
  assert.deepEqual(storage.updateThemeDay({koi:'night',coast:'day'},'koi','dusk'),{koi:'night',coast:'day'});
});

test('unavailable storage does not throw and failed writes are reported', t => {
  assert.equal(typeof storage.loadThemeDays, 'function');
  localStore(t);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('unavailable')}});
  assert.deepEqual(storage.loadThemeDays('night'),{koi:'night',coast:'night'});
  assert.equal(storage.saveThemeDays({koi:'day',coast:'night'}),false);
});
