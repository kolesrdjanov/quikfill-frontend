import { createApp } from 'vue'
import ControlledForm from './ControlledForm.vue'
import RekaWidgets from './RekaWidgets.vue'
import { mountReactWidgets } from './react-widgets'
const root = document.getElementById('fixtures')!
const variant = new URLSearchParams(location.search).get('form') ?? 'native'
if (variant === 'reactMulti') mountReactWidgets('reactMulti')
else if (variant === 'react') mountReactWidgets('reactSelect')
else if (variant === 'radix') mountReactWidgets('toggles')
else if (variant === 'vue') createApp(ControlledForm).mount(root)
else if (variant === 'reka') createApp(RekaWidgets).mount(root)
else if (variant === 'saved')
  root.innerHTML =
    '<form id="saved"><label>Email<input name="email" type="email" value="mine@example.com"></label><label>First name<input name="first_name"></label><label>Last name<input name="last_name"></label></form>'
else if (variant === 'ai' || variant === 'failure' || variant === 'slow')
  root.innerHTML = `<form id="ai"><label>Email<input name="email" type="email" value="mine@example.com"></label><label>Project codename<input name="${variant === 'failure' ? 'failure_topic' : variant === 'slow' ? 'slow_topic' : 'codename'}"></label><label>Milestone<input name="milestone"></label></form>`
else
  root.innerHTML =
    '<form id="native"><label>First name<input name="first_name" required></label><label>Email<input name="email" type="email" required></label><label>Role<select name="role" required><option value="">Choose</option><option value="editor">Editor</option></select></label><label>Terms<input name="terms" type="checkbox" required></label><label>Password<input name="password" type="password"></label><button type="submit">Submit fixture</button></form><form id="other"><label>Email<input name="email" type="email"></label><label>Name<input name="name"></label></form>'
for (const form of root.querySelectorAll('form'))
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    form.dataset.submitted = 'true'
  })
