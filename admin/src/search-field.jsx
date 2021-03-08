import SearchBar from 'material-ui-search-bar';
import React, { useState } from 'react';

export default ({ onSearch }) => {
    const [search, setSearch] = useState('');

    return (<SearchBar
                value={search}
                onChange={(newValue) => setSearch(newValue)}
                onRequestSearch={() => onSearch(search)}
                onCancelSearch={() => {
                    setSearch('');
                    onSearch('');
                }} />);
}