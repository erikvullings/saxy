import test from 'tape';
import { Saxy } from '..';

test('should normalize character entity references', (assert) => {
  assert.equal(
    Saxy.parseEntities('&quot;Run!&quot;, he said'),
    '"Run!", he said',
    'normalize &quot;'
  );
  assert.equal(
    Saxy.parseEntities('&amp; On &amp; On &amp; On'),
    '& On & On & On',
    'normalize &amp;'
  );
  assert.equal(Saxy.parseEntities('J&apos;irai demain'), "J'irai demain", 'normalize &apos;');
  assert.equal(
    Saxy.parseEntities('&lt;thisIsNotATag&gt;'),
    '<thisIsNotATag>',
    'normalize &gt; and &lt;'
  );
  assert.equal(
    Saxy.parseEntities('&lt;&gt;&quot;&amp;&amp;&quot;&apos;&gt;'),
    '<>"&&"\'>',
    'normalize several'
  );
  assert.end();
});

test('should normalize numeric character references', (assert) => {
  assert.equal(Saxy.parseEntities('&#xA7;'), '§', 'normalize hexadecimal entities');
  assert.equal(Saxy.parseEntities('&#167;'), '§', 'normalize decimal entities');
  assert.equal(
    Saxy.parseEntities('&#8258;&#x2612;&#12291;&#x2E3B;'),
    '⁂☒〃⸻',
    'normalize mixed entities'
  );
  assert.end();
});

test('should ignore invalid character entity references', (assert) => {
  assert.equal(Saxy.parseEntities('&unknown;'), '&unknown;', 'ignore unknown entity references');
  assert.equal(Saxy.parseEntities('&amp'), '&amp', 'ignore unterminated entity references');
  assert.equal(
    Saxy.parseEntities('&#notanumber;'),
    '&#notanumber;',
    'ignore non-numeric decimal character refrences'
  );
  assert.equal(
    Saxy.parseEntities('&#xnotanumber;'),
    '&#xnotanumber;',
    'ignore non-numeric hexa character refrences'
  );
  assert.end();
});
