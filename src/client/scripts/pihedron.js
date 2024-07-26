const { pathname } = window.location

const nav = document.querySelector('nav')

for (const child of nav.children) {
    const href = child.getAttribute('href')
    if (href === pathname) {
        child.classList.add('active')
    }
}