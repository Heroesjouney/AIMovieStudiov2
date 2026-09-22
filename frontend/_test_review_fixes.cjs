const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

function source(file) {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function find(tree, predicate) {
  let result;
  function visit(node) {
    if (predicate(node)) result = node;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(result);
  return result;
}
function compileExpression(expression, context) {
  return vm.runInNewContext(ts.transpile(`(${expression})`, { target: ts.ScriptTarget.ES2020 }), context);
}
function handler(file, name, context) {
  const tree = source(file);
  const declaration = find(tree, node => ts.isVariableDeclaration(node) && node.name.getText(tree) === name);
  return compileExpression(declaration.initializer.getText(tree), context);
}
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const recipe = {
  seed: 0, denoise: 0.8, resolved_negative_prompt: 'watermark',
  params: {
    user_prompt: 'Arra pilots', width: 1344, height: 768,
    cfg: 2, steps: 8, megapixels: 1.5,
    checkpoint_override: 'custom.safetensors',
    loras: [{ name: 'style.safetensors', strength_model: 0.7 }],
    linked_reference_paths: ['linked.png'],
    horizontal_angle: 90, vertical_angle: -10, zoom: 4, composition_preset: 'medium',
  },
};

function angleContext(statuses) {
  const calls = {};
  const context = {
    shot: { id: 'shot', frame_image_path: 'source.png', assets: [], angle_images: {} },
    assets: [], selectedAngles: ['front', 'back'], prompt: 'Arra', projectId: 'project',
    submissionRef: { current: false }, busy: false, setSubmitting: () => {},
    generateCameraAngles: async () => ({ job_id: 'parent', status: 'processing', sub_jobs: [
      { sub_job_id: 'a', angle: 'front', status: 'processing' },
      { sub_job_id: 'b', angle: 'back', status: 'processing' },
    ] }),
    checkAnglesStatus: async id => {
      calls[id] = (calls[id] || 0) + 1;
      return statuses(id, calls[id]);
    },
    useStudioStore: { getState: () => ({ addActiveFrameJob: () => {} }) },
    poll: { isRunning: false, setError: message => { context.error = message; },
      startPolling: (check, complete) => { context.check = check; context.complete = complete; } },
    setSelectedAngles: () => {}, onRefresh: async () => {},
    updateShot: async (...args) => { context.saved = args; },
    saveImageFromUrl: async (project, path) => ({ image_url: path }),
  };
  return { context, calls };
}

test('multi-angle failures are counted once while other angles are pending', async () => {
  const { context, calls } = angleContext(id => id === 'a' ? { status: 'failed', error_message: 'Failed view' } : { status: 'processing' });
  await handler('src/components/shots/MultiAnglePanel.tsx', 'handleGenerate', context)();
  assert.equal((await context.check()).status, 'processing');
  assert.equal((await context.check()).status, 'processing');
  assert.equal(calls.a, 1);
});

test('all failed angles produce terminal failure, not false success', async () => {
  const { context } = angleContext(() => ({ status: 'failed', error_message: 'Out of memory' }));
  await handler('src/components/shots/MultiAnglePanel.tsx', 'handleGenerate', context)();
  const result = await context.check();
  assert.equal(result.status, 'failed');
  assert.ok(result.error_message);
});

test('partial angle success is saved without polling completed failures again', async () => {
  let finish = false;
  const { context, calls } = angleContext(id => id === 'a' ? { status: 'failed', error_message: 'Failed view' } :
    finish ? { status: 'completed', image_urls: ['back.png'] } : { status: 'processing' });
  await handler('src/components/shots/MultiAnglePanel.tsx', 'handleGenerate', context)();
  assert.equal((await context.check()).status, 'processing');
  finish = true;
  assert.equal((await context.check()).status, 'completed');
  await context.complete();
  assert.equal(calls.a, 1);
  assert.deepEqual(plain(context.saved[2].angle_images), { back: 'back.png' });
});

test('storyboard card surfaces failed submission and retains saved options', async () => {
  let args, error;
  const context = {
    submissionRef: { current: false }, regenPoll: { isRunning: false, setError: value => { error = value; } },
    setRegeneratingId: () => {}, selectedStoryboardDriver: 'qwen_image_edit',
    generateShotFrame: async (...values) => { args = values; return { status: 'failed', error_message: 'Required reference is missing' }; },
  };
  await handler('src/components/shots/ShotComposer.tsx', 'handleRegenerate', context)({ id: 'shot', generation_recipe: recipe });
  assert.equal(error, 'Required reference is missing');
  assert.equal(args[6], 0);
  assert.deepEqual(plain(args[7]), ['linked.png']);
  assert.equal(args[15].megapixels, 1.5);
  assert.equal(context.submissionRef.current, false);
});

test('storyboard card renders regeneration errors', () => {
  const tree = source('src/components/shots/ShotComposer.tsx');
  find(tree, node => ts.isJsxExpression(node) && node.getText(tree).includes('regenPoll.error'));
});

test('ShotDetail restores saved settings and camera values when switching shots', async () => {
  const tree = source('src/components/shots/ShotDetail.tsx');
  const effect = find(tree, node => ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0].getText(tree).includes('setPrompt('));
  const context = { shot: { id: 'shot', generation_recipe: recipe } };
  const setters = {
    setPrompt: 'prompt', setNegativePrompt: 'negativePrompt', setLinkedImagePaths: 'linkedImagePaths',
    setLoras: 'loras', setCheckpointOverride: 'checkpointOverride', setUserSteps: 'userSteps',
    setUserCfg: 'userCfg', setUserMegapixels: 'userMegapixels',
  };
  for (const [setter, key] of Object.entries(setters)) context[setter] = value => { context[key] = value; };
  compileExpression(effect.arguments[0].getText(tree), context)();
  assert.deepEqual(plain(context.loras), recipe.params.loras);
  assert.deepEqual(plain(context.linkedImagePaths), recipe.params.linked_reference_paths);
  assert.equal(context.checkpointOverride, 'custom.safetensors');
  assert.equal(context.userSteps, 8);
  assert.equal(context.userCfg, 2);
  assert.equal(context.userMegapixels, 1.5);
  let args;
  Object.assign(context, {
    submissionRef: { current: false }, busy: false, setSubmitting: () => {},
    selectedStoryboardDriver: 'qwen_image_edit', poll: { setError: () => {} },
    generateShotFrame: async (...values) => { args = values; return { status: 'failed', error_message: 'Mock stop' }; },
  });
  await handler('src/components/shots/ShotDetail.tsx', 'handleGenerateFrame', context)();
  assert.equal(args[6], 0);
  assert.equal(args[8], 0.8);
  assert.equal(args[11], 90);
  assert.equal(args[12], -10);
  assert.equal(args[13], 4);
  assert.equal(args[14], 'medium');
  assert.equal(args[15].checkpoint_override, 'custom.safetensors');
});
