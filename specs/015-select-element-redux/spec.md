I want to rethink how selection works a bit.

I'd like you to create a specs/015-select-elements-redux with these ideas. specs/010-select-elements-ux had our past ideas.

In short, I think we should:

- Select only elements exactly matching the clicked element by default.
- The dropdown would then show other closest matching "groups" of elements.  


I'll break each of those down:

## Select only elements exactly matching the clicked element by default

When someone clicks an element, we should:

- Look at the element
- Figure out what component it is in if any

Then, if it's in a component, we should:

- Find all the other components in the page
- Look for elements that exactly match (tagName and classNames)
- Select those exactly matching elements

If it's NOT in a component, we should:

- Look for all elements that exactly match (tagName and classNames)


## The dropdown would then show other closest matching "groups" of elements.  

In the dropdown, we should list the most similar "groups" (or sets) of elements.

For example, lets say we clicked a <TabGroup> element like <div class="a b c d">,

then we should list all other TabGroup elements that closesly match like:

-------------
- [ ] (5) +e
- [ ] (1) -a
- [ ] (1) +f -b
- [ ] (8) -b -c
-------------

That is, we are scanning for other elements and doing a diff compared to the className (tagName should always match).


When the user clicked on an element in a Component, these will always be scoped to the component.

When the user clicked an element not in a Component, we will ultimately need to scan the whole page.


## Hover preview in the dropdown

As the user hovers over a group in the dropdown, we should preview what that group would select — highlight those elements on the page (e.g. with the teal outline) so the user can see exactly which elements belong to that group before committing to it.


