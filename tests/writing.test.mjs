import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StoryStream, STORIES } from '../src/modes/shared/stories.ts';
import { WritingLayout } from '../src/modes/shared/writing-layout.ts';
import { normalizeSettings } from '../src/engine/settings.ts';

describe('Story passages', () => {
  it('continues through the entire story collection before repeating', () => {
    assert.ok(STORIES.length >= 12);
    const book = STORIES.join('\n\n') + '\n\n';
    const stream = new StoryStream();
    const output = Array.from(
      { length: Array.from(book).length },
      () => stream.next().character,
    ).join('');
    assert.equal(output, book);
    assert.equal(stream.next().character, STORIES[0][0]);
    for (const story of STORIES) assert.ok(story.split('\n\n').length >= 3);
  });

  it('reveals a complete prepared passage character by character, including automatic spaces', () => {
    const stream = new StoryStream('The fox found a key.');
    let output = '';
    for (let i = 0; i < 'The fox found a key.\n'.length; i++)
      output += stream.next().character;
    assert.equal(output, 'The fox found a key.\n');
  });
  it('loops at paragraph boundaries and supports a fresh start', () => {
    const stream = new StoryStream('Hi!');
    assert.equal(
      Array.from({ length: 5 }, () => stream.next().character).join(''),
      'Hi!\n\n',
    );
    assert.equal(stream.next().character, 'H');
    stream.reset();
    assert.equal(stream.next().word, 'Hi!');
  });
  it('uses original built-in stories for empty custom text and preserves Unicode characters', () => {
    assert.equal(new StoryStream('  ').next().character, STORIES[0][0]);
    const stream = new StoryStream('🙂 hi');
    assert.equal(stream.next().character, '🙂');
    assert.equal(stream.next().character, ' ');
    assert.equal(stream.next().word, 'hi');
  });
  it('normalizes saved custom text and bounds its size without splitting emoji', () => {
    const settings = normalizeSettings({ storyText: '🙂'.repeat(2001) }, [
      'story',
    ]);
    assert.equal(Array.from(settings.storyText).length, 2000);
    assert.equal(settings.storyText.endsWith('🙂'), true);
    assert.equal(
      normalizeSettings({ storyText: '<hello>\r\nworld' }, ['story']).storyText,
      '<hello>\nworld',
    );
    assert.equal(
      normalizeSettings({ storyText: 123 }, ['story']).storyText,
      '',
    );
  });
});

describe('writing layout', () => {
  it('moves an entire story word to the next line when it will not fit', () => {
    const layout = new WritingLayout();
    layout.resize(400, 800, 32);
    layout.place(260);
    const position = layout.place(20, false, 120);
    assert.equal(position.x, layout.left);
    assert.equal(position.y, layout.top + layout.lineHeight);
  });
  it('wraps long typed words and advances an explicit carriage return', () => {
    const layout = new WritingLayout();
    layout.resize(320, 800, 32);
    for (let i = 0; i < 20; i++) {
      const position = layout.place(30);
      assert.ok(position.x >= layout.left);
      assert.ok(position.x + 30 <= layout.right);
    }
    const y = layout.y;
    assert.equal(layout.place(0, true).y, y + layout.lineHeight);
  });
  it('keeps the cursor on screen during long typing sessions and after resize', () => {
    const layout = new WritingLayout();
    layout.resize(320, 480, 48);
    let scrolled = false;
    for (let i = 0; i < 1000; i++) {
      const position = layout.place(30);
      if (position.scroll > 0) scrolled = true;
      assert.ok(position.y + layout.lineHeight <= layout.bottom + 0.0001);
    }
    assert.equal(scrolled, true);
    layout.resize(1000, 800, 32);
    assert.equal(layout.x, layout.left);
    assert.equal(layout.y, layout.top);
  });
});
