import React, { useState } from 'react';

import I18n from '@iobroker/adapter-react-v5/i18n';

import SearchBar from './searchBar';

export default ({ onSearch }) => {
    const [search, setSearch] = useState('');

    return <SearchBar
        value={search}
        placeholder={I18n.t('Search')}
        onChange={newValue => setSearch(newValue)}
        onRequestSearch={() => onSearch(search)}
        onCancelSearch={() => {
            setSearch('');
            onSearch('');
        }}
    />;
}