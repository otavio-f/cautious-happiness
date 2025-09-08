'use strict';

/**
 * # About tags
 *
 * Any character from latin1/ISO8859-1 can be used for tags, with some exceptions:
 *  - any form of space, including non-visible ones. Use underscores (<code>_</code>) instead;
 *  - brackets (<code>{}</code>);
 *  - colon (<code>:</code>);
 *  - asterisk (<code>*</code>);
 *  - tags cannot start with a minus character (<code>-</code>);
 *  - tags cannot start with a tilde character (<code>~</code>);
 *  - equals (<code>=</code>);
 *  - greater than (<code>></code>);
 *  - less than (<code><</code>);
 */

/**
 * # About queries:
 *
 * ## Separators (<code> </code>, <code>|</code>, <code>^</code>)
 *
 * Queries are formed by a series of tags and subqueries separated by spaces (<code> </code>), pipes <code>|</code> or carets <code>^</code>.
 *
 * A space between two tags indicates they both should be present;
 * A pipe between two tags indicates one or the other can be present;
 * A caret between two tags indicates one or the other can be present, but not both;
 *
 * #### Examples:
 *
 * <code>keyboard usb</code> searches for all keyboards with usb connection
 *
 * <code>love|money</code> searches for love, money or both
 *
 * <code>all^nothing</code> searches for all or nothing, but *excludes* results that has both
 *
 * <code>all ^ nothing</code>, <code>all^ nothing</code> and <code>all&nbsp;&nbsp;&nbsp;&nbsp;^&nbsp;&nbsp;&nbsp;nothing</code> is the same as above
 *
 * #### Notes:
 *
 *  - Separators at the start and end of queries are ignored;
 *  - Spaces around pipes or carets are ignored;
 *  - After collapsing all spaces in between, if a pipe is followed by a caret (or the inverse), the query won't be valid and search shouldn't produce results.
 *  - After collapsing all spaces in between, if a there's two consecutive pipes or two consecutive carets, the query won't be valid and search shouldn't produce results.
 *
 * ## Namespaces (<code>:</code>)
 *
 * Namespaces are "tag categories". The same tag can be on different namespaces.
 * A namespace can be specified by using a comma (<code>:</code>) between the namespace and a tag.
 * When not specified, the tag will be searched in all namespaces
 *
 * #### Examples:
 *
 * <code>weapon:cord</code> searches for all weapons that use some sort of cord
 *
 * <code>camping:cord</code> searches for all cord material related to camping
 *
 * <code>cord</code> will search for any cord, including the weapon related and camping related
 *
 * Notes:
 *
 *  - A tag cannot contain the colon character;
 *  - If two colons are in the same tag, the query won't be valid and search shouldn't produce results.
 *
 * ## Wildcards (<code>\*</code>)
 *
 * An asterisk can be used to search for multiple tags with a common set of characters.
 *
 * #### Examples:
 *
 * <code>*berry</code> will match any tag that ends with *berry*, in all namespaces
 * <code>\*less\*</code> will match any tag that starts or ends with *less*, or contains *less* between any character
 *
 * #### Notes:
 *
 *  - When used alone as a tag, all asterisks and prior separators will be ignored;
 *  - Two or more consecutive asterisks will be collapsed into one;
 *
 * ## Exclusion (<code>-</code>)
 *
 * When a tag or subquery is prepended with a minus (<code>-</code>), only results that doesn't contain the tag will be fetched.
 *
 * #### Examples
 *
 * <code>toy -car</code> will search for all toys that aren't cars.
 *
 * <code>picture -{john mary*}</code> will search for all pictures that doesn't have both john and anything starting with mary-
 *
 * #### Notes:
 *
 *  - An even number of consecutive dashes will be ignored;
 *  - An odd number of consecutive dashes will be collapsed into one;
 *
 * ## Subqueries (<code>{}</code>)
 *
 * Subqueries are a bunch of tags or subqueries between brackets (<code>{}</code>). All open brackets must be closed.
 *
 * #### Example:
 *
 * <code>{movie adventure|{scifi -terror}} futuristic</code> will search for futuristic movies that are either adventure, or scifi but not terror
 *
 * #### Notes:
 *
 * - Empty subqueries and all prior separators will be ignored;
 * - Separators on start and end of subqueries will be ignored;
 * - A subquery with only one inner tag or inner subquery will be ignored;
 *
 * ## Meta tags (<code>=</code> <code><</code> <code>></code> <code><=</code> <code>>=</code>)
 *
 * Appending an equal (=), less than or less than equals (&lt;)/(&lt;=), greater than or greater than equals (&gt;)/(&gt;=) to a tag makes it a metatag.
 *
 * Metatags refer to special attributes of media or tags.
 * If a meta tag doesn't exist or isn't valid, the search will return no results
 *
 * #### Examples:
 *
 * <code>video>2MP</code> will search for all videos that have a resolution of at least 2 Mega Pixels
 *
 * <code>author:count>2</code> will search for all media that has at least two tags in the author namespace
 *
 * <code>video {author:count<=2^-game*}</code> searches for any video that has either two or less tags in the author namespace or doesn't have a tag that starts with game-,
 * but not both
 *
 * #### Notes:
 *
 *  - Any asterisk on a metatag will make the entire query invalid;
 *  - Only one equal or comparison operator should be used on each metatag;
 *
 * @typedef {string} SearchQuery
 */

/**
 * @typedef {(any) => boolean} SearchParameter
 */

/**
 * Removes redundancies
 * @param {SearchQuery} query
 * @returns {SearchQuery}
 */
const prune = (query) => {
    return query
        .replace(/ {2,}/g, ' ') // collapse consecutive spaces
        .replace(/\*{2,}/g, '*') // collapse consecutive asterisks
        .replace(/[ |^]?-?\*/g, '') // remove single asterisks and previous separator
        .replace(/ ?([|^]) ?/g, '$1') // remove spaces before and after pipe or caret
        .replace(/--/g, '') // remove even number of negations
        .replace(/{([^ |^]+)}/g, '$1') // remove useless subqueries
        .replace(/{ ?}/g, '') // remove empty subqueries
        .replace(/^[\s|^]/, '') // trim start separators
        .replace(/[\s|^]$/g, '') // trim end separators
}

/**
 * Verify if the query has balanced curly brackets
 * @param {SearchQuery} query
 * @returns {boolean}
 */
const isBalanced = (query) => {
    // count of open curly brackets
    let open = 0;

    for(const char of query) {
        if(char === '{') // open bracket
            open += 1;
        if(char === '}') { // close bracket
            if(open === 0) // edge case: closing bracket without opening
                return false;
            open -= 1;
        }
    }

    return open === 0;
}

/**
 * Verify if the query is valid
 * @param {SearchQuery} query
 * @returns {boolean}
 */
const isValid = (query) => {
    if(!isBalanced(query))
        return false;

    // search with no tags, including empty string
    if(/^[ ^|{}\-]*$/.exec(query))
        return false;

    // separator with no tag in between
    if(/[|^][ }{]*[|^]/.exec(query))
        return false;

    // lone negation
    if(/-[ ^|]/.exec(query))
        return false;

    // invalid metatag marker
    if(/[<>]{2}|=>|=<|==/.exec(query))
        return false;

    // incomplete metatag
    if(/[<>=](?:[ |^}{-]|$)/.exec(query) || /(?:^|[ |^}{-])[<>=]/.exec(query))
        return false;

    // asterisk on metatag
    if(/[^ |^]*\*[^ |^]*[<>=]/.exec(query) || /[<>=][^ |^]*\*[^ |^]*/.exec(query))
        return false;

    // no empty namespace or namespace without tag
    if(/:(?:[ |^}{\-=><]|$)/.exec(query) || /(?:[ |^}{\-=><]|^):/.exec(query))
        return false;

    // no double colon for namespace
    if(/:[^ |^]*:/.exec(query))
        return false;

    return true;
}

/**
 * Transforms a query into a series of media filters
 * @param {SearchQuery} query
 */
const queryToFilter = (query) => {

}

/**
 * Parses a search query into a filter function
 * @param {SearchQuery} query
 * @returns {null} Returns null if the query is not valid
 */
const parseQuery = (query) => {
    if(!isValid(query))
        return null;
    return prune(query);
}

exports.parseQuery = parseQuery;
