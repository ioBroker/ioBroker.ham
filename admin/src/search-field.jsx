import I18n from '@iobroker/adapter-react/i18n';
import SearchBar from 'material-ui-search-bar';
import React, { useState } from 'react';

export default ({ onSearch }) => {
    const [search, setSearch] = useState('');

    return (<SearchBar
                value={search}
                placeholder={I18n.t('Search')}
                onChange={(newValue) => setSearch(newValue)}
                onRequestSearch={() => onSearch(search)}
                onCancelSearch={() => {
                    setSearch('');
                    onSearch('');
                }} />);
}