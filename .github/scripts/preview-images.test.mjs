/*
 *   Copyright 2026 Spicule Ltd
 *   Apache License, Version 2.0.
 */

/** Image tag grammar: the tag the lifecycle asks for is the one docker.yml publishes. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  IMAGE_REGISTRY,
  IMAGE_REPOSITORY,
  SHA_TAG_LENGTH,
  assertImageTag,
  describeImage,
  imageRef,
  prImageTag,
} from './preview-images.mjs';

test('the per-SHA tag is the first 7 hex of the head sha and nothing else is accepted', () => {
  assert.equal(prImageTag('0123456789abcdef0123456789abcdef01234567'), '0123456');
  for (const bad of ['abc', 'g'.repeat(40), 'A'.repeat(40), `${'a'.repeat(40)}\n`, 'a'.repeat(39), null, undefined, 5]) {
    assert.throws(() => prImageTag(bad), /invalid commit sha/, String(bad));
  }
});

test('assertImageTag accepts only 7 lower-case hex characters (no develop, latest or pr-<n>)', () => {
  assert.equal(assertImageTag('abcdef0'), 'abcdef0');
  for (const bad of ['develop', 'latest', 'pr-12', 'abcdef', 'abcdef01', 'ABCDEF0', 'abcdef0;id', '$(id)', '', null]) {
    assert.throws(() => assertImageTag(bad), /invalid image tag/, String(bad));
  }
});

test('imageRef is built only from the registry constant, the repository constant and a validated tag', () => {
  assert.equal(imageRef('abcdef0'), 'ghcr.io/spiculedata/saiku:abcdef0');
  assert.equal(IMAGE_REGISTRY, 'ghcr.io/spiculedata');
  assert.equal(IMAGE_REPOSITORY, 'saiku');
  assert.throws(() => imageRef('develop'));
  assert.throws(() => imageRef('a/../b'));
});

test('describeImage drops anything outside the grammar instead of repairing it', () => {
  assert.deepEqual(describeImage({ tag: 'abcdef0', extra: 'x' }), { tag: 'abcdef0' });
  for (const bad of [null, undefined, 'abcdef0', {}, { tag: 'develop' }, { tag: 'abcdef0;id' }]) {
    assert.equal(describeImage(bad), null);
  }
});

test('the tag length is the 7 hex that docker.yml tags PR head builds with (saiku#2170)', () => {
  assert.equal(SHA_TAG_LENGTH, 7);
});
