import React from 'react';
import ReactDOM from 'react-dom';
import {Block, Document, Text, Value} from 'slate';
import {Editor} from 'slate-react';
import Plain from 'slate-plain-serializer';

import BracesPlugin from './slate-plugins/braces';
import ClearPlugin from './slate-plugins/clear';
import NewlinePlugin from './slate-plugins/newline';
import PluginPrism, {setPrismTokens} from './slate-plugins/prism/index';
import RunnerPlugin from './slate-plugins/runner';

import Typeahead from './Typeahead';

export const TYPEAHEAD_DEBOUNCE = 300;

function flattenSuggestions(s) {
  return s ? s.reduce((acc, g) => acc.concat(g.items), []) : [];
}

export const makeFragment = text => {
  const lines = text.split('\n').map(line =>
    Block.create({
      type: 'paragraph',
      nodes: [Text.create(line)],
    })
  );

  const fragment = Document.create({
    nodes: lines,
  });
  return fragment;
};

export const getInitialValue = query => Value.create({document: makeFragment(query)});

class Portal extends React.Component<any, any> {
  node: any;

  constructor(props) {
    super(props);
    const {index = 0, prefix = 'query'} = props;
    this.node = document.createElement('div');
    this.node.classList.add(`slate-typeahead`, `slate-typeahead-${prefix}-${index}`);
    document.body.appendChild(this.node);
  }

  componentWillUnmount() {
    document.body.removeChild(this.node);
  }

  render() {
    return ReactDOM.createPortal(this.props.children, this.node);
  }
}

class QueryField extends React.Component<any, any> {
  menuEl: any;
  plugins: any;
  resetTimer: any;

  constructor(props, context) {
    super(props, context);

    const {prismDefinition = {}, prismLanguage = 'promql'} = props;

    this.plugins = [
      BracesPlugin(),
      ClearPlugin(),
      RunnerPlugin({handler: props.onPressEnter}),
      NewlinePlugin(),
      PluginPrism({definition: prismDefinition, language: prismLanguage}),
    ];

    this.state = {
      labelKeys: {},
      labelValues: {},
      metrics: props.metrics || [],
      suggestions: [],
      typeaheadIndex: 0,
      typeaheadPrefix: '',
      value: getInitialValue(props.initialQuery || ''),
    };
  }

  componentDidMount() {
    this.updateMenu();
  }

  componentWillUnmount() {
    clearTimeout(this.resetTimer);
  }

  componentDidUpdate() {
    this.updateMenu();
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.metrics && nextProps.metrics !== this.props.metrics) {
      this.setState({metrics: nextProps.metrics}, this.onMetricsReceived);
    }
    // initialQuery is null in case the user typed
    if (
      nextProps.initialQuery !== null &&
      nextProps.initialQuery !== this.props.initialQuery
    ) {
      this.setState({value: getInitialValue(nextProps.initialQuery)});
    }
  }

  onChange = ({value}) => {
    const changed = value.document !== this.state.value.document;
    this.setState({value}, () => {
      if (changed) {
        this.handleChangeQuery();
      }
    });

    window.requestAnimationFrame(this.handleTypeahead);
  };

  onMetricsReceived = () => {
    if (!this.state.metrics) {
      return;
    }
    setPrismTokens(this.props.language, 'metrics', this.state.metrics);

    // Trigger re-render
    window.requestAnimationFrame(() => {
      // Bogus edit to trigger highlighting
      const change = this.state.value
        .change()
        .insertText(' ')
        .deleteBackward(1);
      this.onChange(change);
    });
  };

  request = url => {
    if (this.props.request) {
      return this.props.request(url);
    }
    return fetch(url);
  };

  handleChangeQuery = () => {
    // Send text change to parent
    const {onQueryChange} = this.props;
    if (onQueryChange) {
      onQueryChange(Plain.serialize(this.state.value));
    }
  };

  onKeyDown = (event, change) => {
    const {typeaheadIndex, suggestions} = this.state;

    switch (event.key) {
      case 'Escape': {
        if (this.menuEl) {
          event.preventDefault();
          event.stopPropagation();
          this.resetTypeahead();
          return true;
        }
        break;
      }

      case ' ': {
        if (event.ctrlKey) {
          event.preventDefault();
          this.handleTypeahead();
          return true;
        }
        break;
      }

      case 'Enter':
      case 'Tab': {
        if (this.menuEl) {
          // Dont blur input
          event.preventDefault();
          if (!suggestions || suggestions.length === 0) {
            return undefined;
          }

          // Get the currently selected suggestion
          const flattenedSuggestions = flattenSuggestions(suggestions);
          const selected = Math.abs(typeaheadIndex);
          const selectedIndex = selected % flattenedSuggestions.length || 0;
          const suggestion = flattenedSuggestions[selectedIndex];

          this.applyTypeahead(change, suggestion);
          return true;
        }
        break;
      }

      case 'ArrowDown': {
        if (this.menuEl) {
          // Select next suggestion
          event.preventDefault();
          this.setState({typeaheadIndex: typeaheadIndex + 1});
        }
        break;
      }

      case 'ArrowUp': {
        if (this.menuEl) {
          // Select previous suggestion
          event.preventDefault();
          this.setState({typeaheadIndex: Math.max(0, typeaheadIndex - 1)});
        }
        break;
      }

      default: {
        // console.log('default key', event.key, event.which, event.charCode, event.locale, data.key);
        break;
      }
    }
    return undefined;
  };

  handleTypeahead = (change?, item?) => {
    return change || this.state.value.change();
  };

  applyTypeahead(change?, suggestion?): {value: object} {
    return {value: {}};
  }

  resetTypeahead = () => {
    this.setState({
      suggestions: [],
      typeaheadIndex: 0,
      typeaheadPrefix: '',
      typeaheadContext: null,
    });
  };

  handleBlur = () => {
    const {onBlur} = this.props;
    // If we dont wait here, menu clicks wont work because the menu
    // will be gone.
    this.resetTimer = setTimeout(this.resetTypeahead, 100);
    if (onBlur) {
      onBlur();
    }
  };

  handleFocus = () => {
    const {onFocus} = this.props;
    if (onFocus) {
      onFocus();
    }
  };

  handleClickMenu = item => {
    // Manually triggering change
    const change = this.applyTypeahead(this.state.value.change(), item);
    this.onChange(change);
  };

  updateMenu = () => {
    const {suggestions} = this.state;
    const menu = this.menuEl;
    const selection = window.getSelection();
    const node = selection.anchorNode;

    // No menu, nothing to do
    if (!menu) {
      return;
    }

    // No suggestions or blur, remove menu
    const hasSuggesstions = suggestions && suggestions.length > 0;
    if (!hasSuggesstions) {
      menu.removeAttribute('style');
      return;
    }

    // Align menu overlay to editor node
    if (node && node.parentElement) {
      // Read from DOM
      const rect = node.parentElement.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      // Write DOM
      requestAnimationFrame(() => {
        menu.style.opacity = 1;
        menu.style.top = `${rect.top + scrollY + rect.height + 4}px`;
        menu.style.left = `${rect.left + scrollX - 2}px`;
      });
    }
  };

  menuRef = el => {
    this.menuEl = el;
  };

  renderMenu = () => {
    const {portalPrefix} = this.props;
    const {suggestions} = this.state;
    const hasSuggesstions = suggestions && suggestions.length > 0;
    if (!hasSuggesstions) {
      return null;
    }

    // Guard selectedIndex to be within the length of the suggestions
    let selectedIndex = Math.max(this.state.typeaheadIndex, 0);
    const flattenedSuggestions = flattenSuggestions(suggestions);
    selectedIndex = selectedIndex % flattenedSuggestions.length || 0;
    const selectedKeys = (flattenedSuggestions.length > 0
      ? [flattenedSuggestions[selectedIndex]]
      : []
    ).map(i => (typeof i === 'object' ? i.text : i));

    // Create typeahead in DOM root so we can later position it absolutely
    return (
      <Portal prefix={portalPrefix}>
        <Typeahead
          menuRef={this.menuRef}
          selectedItems={selectedKeys}
          onClickItem={this.handleClickMenu}
          groupedItems={suggestions}
        />
      </Portal>
    );
  };

  render() {
    return (
      <div className="slate-query-field">
        {this.renderMenu()}
        <Editor
          autoCorrect={false}
          onBlur={this.handleBlur}
          onKeyDown={this.onKeyDown}
          onChange={this.onChange}
          onFocus={this.handleFocus}
          placeholder={this.props.placeholder}
          plugins={this.plugins}
          spellCheck={false}
          value={this.state.value}
        />
      </div>
    );
  }
}

export default QueryField;
