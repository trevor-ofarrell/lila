import { h, VNode } from 'snabbdom';
import { prop, Prop } from 'common';
import { bind, dataIcon, iconTag, scrollTo } from '../util';
import { ctrl as chapterNewForm, StudyChapterNewFormCtrl } from './chapterNewForm';
import { ctrl as chapterEditForm, StudyChapterEditFormCtrl } from './chapterEditForm';
import AnalyseCtrl from '../ctrl';
import { StudyCtrl, StudyChapterMeta, LocalPaths, StudyChapter, TagArray, StudyChapterConfig } from './interfaces';
import { StudySocketSend } from '../socket';

export interface StudyChaptersCtrl {
  newForm: StudyChapterNewFormCtrl;
  editForm: StudyChapterEditFormCtrl;
  list: Prop<StudyChapterMeta[]>;
  get(id: string): StudyChapterMeta | undefined;
  size(): number;
  sort(ids: string[]): void;
  firstChapterId(): string;
  toggleNewForm(): void;
  localPaths: LocalPaths;
}

export function ctrl(
  initChapters: StudyChapterMeta[],
  send: StudySocketSend,
  setTab: () => void,
  chapterConfig: (id: string) => Promise<StudyChapterConfig>,
  root: AnalyseCtrl
): StudyChaptersCtrl {
  const list: Prop<StudyChapterMeta[]> = prop(initChapters);

  const newForm = chapterNewForm(send, list, setTab, root);
  const editForm = chapterEditForm(send, chapterConfig, root.trans, root.redraw);

  const localPaths: LocalPaths = {};

  return {
    newForm,
    editForm,
    list,
    get: (id: string) => list().find(c => c.id === id),
    size: () => list().length,
    sort(ids) {
      send('sortChapters', ids);
    },
    firstChapterId: () => list()[0].id,
    toggleNewForm() {
      if (newForm.vm.open || list().length < 64) newForm.toggle();
      else alert('You have reached the limit of 64 chapters per study. Please create a new study.');
    },
    localPaths,
  };
}

export function isFinished(c: StudyChapter) {
  const result = findTag(c.tags, 'result');
  return result && result !== '*';
}

export function findTag(tags: TagArray[], name: string): string | undefined {
  const t = tags.find(t => t[0].toLowerCase() === name);
  return t && t[1];
}

export function resultOf(tags: TagArray[], isWhite: boolean): string | undefined {
  switch (findTag(tags, 'result')) {
    case '1-0':
      return isWhite ? '1' : '0';
    case '0-1':
      return isWhite ? '0' : '1';
    case '1/2-1/2':
      return '1/2';
    default:
      return;
  }
}

let filteredChapters = [];
let filterChInputValue = '';

export function view(ctrl: StudyCtrl): VNode {
  const canContribute = ctrl.members.canContribute(),
    current = ctrl.currentChapter();

  function update(vnode: VNode) {
    const newCount = ctrl.chapters.list().length,
      vData = vnode.data!.li!,
      el = vnode.elm as HTMLElement;
    if (vData.count !== newCount) {
      if (current.id !== ctrl.chapters.firstChapterId()) {
        scrollTo(el, el.querySelector('.active'));
      }
    } else if (ctrl.vm.loading && vData.loadingId !== ctrl.vm.nextChapterId) {
      vData.loadingId = ctrl.vm.nextChapterId;
      scrollTo(el, el.querySelector('.loading'));
    }
    vData.count = newCount;
    if (canContribute && newCount > 1 && !vData.sortable) {
      const makeSortable = function () {
        vData.sortable = window['Sortable'].create(el, {
          draggable: '.draggable',
          handle: 'ontouchstart' in window ? 'span' : undefined,
          onSort() {
            ctrl.chapters.sort(vData.sortable.toArray());
          },
        });
      };
      if (window['Sortable']) makeSortable();
      else lichess.loadScript('javascripts/vendor/Sortable.min.js').then(makeSortable);
    }
  }
  const filterChapters = (event) => {
    filterChInputValue = event.target.value;
    filteredChapters = ctrl.chapters
      .list()
      .filter(chapter => chapter.name.toLowerCase().includes(event.target.value.toLowerCase()));
  };

  const mapChapters = (array) => {
    return array.map((chapter, i) => {
      const editing = ctrl.chapters.editForm.isEditing(chapter.id),
        loading = ctrl.vm.loading && chapter.id === ctrl.vm.nextChapterId,
        active = !ctrl.vm.loading && current && !ctrl.relay?.tourShow.active && current.id === chapter.id;
      return h(
        'div',
        {
          key: chapter.id,
          attrs: { 'data-id': chapter.id },
          class: { active, editing, loading, draggable: canContribute },
        },
        [
          h('span', loading ? h('span.ddloader') : ['' + (i + 1)]),
          h('h3', chapter.name),
          chapter.ongoing ? h('ongoing', { attrs: { ...dataIcon(''), title: 'Ongoing' } }) : null,
          !chapter.ongoing && chapter.res ? h('res', chapter.res) : null,
          canContribute ? h('i.act', { attrs: dataIcon('') }) : null,
        ]
      );
    });
  };

  return h(
    'div.study__chapters',
    {
      hook: {
        insert(vnode) {
          (vnode.elm as HTMLElement).addEventListener('click', e => {
            const target = e.target as HTMLElement;
            const id = (target.parentNode as HTMLElement).getAttribute('data-id') || target.getAttribute('data-id');
            if (!id) return;
            if (target.className === 'act') {
              const chapter = ctrl.chapters.get(id);
              if (chapter) ctrl.chapters.editForm.toggle(chapter);
            } else ctrl.setChapter(id);
          });
          vnode.data!.li = {};
          update(vnode);
          lichess.pubsub.emit('chat.resize');
        },
        postpatch(old, vnode) {
          vnode.data!.li = old.data!.li;
          update(vnode);
        },
        destroy: vnode => {
          const sortable = vnode.data!.li!.sortable;
          if (sortable) sortable.destroy();
        },
      },
    },
    [
      ctrl.chapters.list().length > 7
        ? h('input.chapter-filter', {
            on: { input: filterChapters },
            attrs: { value: filterChInputValue, label: 'filter chapters', placeholder: 'filter chapters' },
            hook: bind('input', filterChapters, ctrl.redraw),
          })
        : null,
    ]
      .concat(
        ctrl.chapters.list().length > 7
          ? filterChInputValue === ''
            ? mapChapters(ctrl.chapters.list())
            : filteredChapters.length >= 1
            ? mapChapters(filteredChapters)
            : h('h3', 'no results')
          : mapChapters(ctrl.chapters.list())
      )
      .concat(
        ctrl.members.canContribute()
          ? [
              h(
                'div.add',
                {
                  hook: bind('click', ctrl.chapters.toggleNewForm, ctrl.redraw),
                },
                [h('span', iconTag('')), h('h3', ctrl.trans.noarg('addNewChapter'))]
              ),
            ]
          : []
      )
  );
}
