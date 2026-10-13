import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCats} from '../src/themes/cats/storage.js';
import {CatGame} from '../src/themes/cats/game.js';
import {DEFAULT_CAT_ENVIRONMENT,normalizeEnvironment} from '../src/themes/cats/environment.js';
import {CAT_CUES,CAT_SAMPLE_FILES} from '../src/themes/cats/audio.js';

test('legacy music preferences are ignored without changing saved cats, props or garden settings',()=>{
 const game=new CatGame(null,{random:()=>.4});game.command('scratch',game.cats[0],game.cats[0].id);
 const before=game.snapshot(),legacy={...before,environment:{season:'winter',time:'night',particles:false,fireflies:false,music:true,musicVolume:1}};
 const after=normalizeCats(legacy);
 assert.deepEqual(after.cats,before.cats);assert.deepEqual(after.props,before.props);assert.equal(after.nextId,before.nextId);
 assert.deepEqual(after.environment,{season:'winter',time:'night',particles:false,fireflies:false});
 assert.deepEqual(normalizeEnvironment({music:true,musicVolume:1}),DEFAULT_CAT_ENVIRONMENT);
});

test('courtyard sound bank contains only short interaction, cat and bird sounds',()=>{
 assert.deepEqual(Object.keys(CAT_CUES).sort(),['purr','meow','food','tap','step','scratch','yarn','mouse','feather','bird'].sort());
 assert.deepEqual(Object.keys(CAT_SAMPLE_FILES).sort(),Object.keys(CAT_CUES).sort());
 assert.ok(Object.values(CAT_CUES).every(spec=>spec.duration<=2.25));
});
