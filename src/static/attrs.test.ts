import test from 'tape';
import { Saxy } from '..';

test('should parse tag attributes', (assert) => {
  assert.deepEqual(Saxy.parseAttrs(' first="one" second="two"  third="three " '), {
    first: 'one',
    second: 'two',
    third: 'three ',
  });

  assert.end();
});

test('should parse attributes values containing ">"', (assert) => {
  assert.deepEqual(Saxy.parseAttrs(' assert="5 > 1" '), {
    assert: '5 > 1',
  });
  assert.end();
});

test('should not parse attributes without a value', (assert) => {
  assert.throws(() => {
    Saxy.parseAttrs(' first');
  }, /Expected a value for the attribute/);
  assert.end();
});

test('should not parse invalid attribute names', (assert) => {
  assert.throws(() => {
    Saxy.parseAttrs(' this is an attribute="value"');
  }, /Attribute names may not contain whitespace/);
  assert.end();
});

test('should not parse unquoted attribute values', (assert) => {
  assert.throws(() => {
    Saxy.parseAttrs(' attribute=value value=invalid');
  }, /Attribute values should be quoted/);
  assert.end();
});

test('should not parse misquoted attribute values', (assert) => {
  assert.throws(() => {
    Saxy.parseAttrs(' attribute="value\'');
  }, /Unclosed attribute value/);
  assert.end();
});
