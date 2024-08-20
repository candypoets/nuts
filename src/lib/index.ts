export function updateVc() {
	setTimeout(() => {
		// find a div with id container
		const container = document.getElementById('container');
		// find a div with id footer
		const footer = document.getElementById('footer');

		const topper = document.getElementById('top');

		const navbar = document.getElementById('navbar');
		// check the height of the footer
		if (!container || !footer) return;
		// see how many pixel it is from the top

		console.log('updatevc', topper, container, footer);
		const top = container.getBoundingClientRect().top;
		const footerHeight = footer?.getBoundingClientRect().height;
		const topperBottom = topper?.getBoundingClientRect().bottom;
		const navbarHeight = navbar?.getBoundingClientRect().height;
		console.log(top, footerHeight, topperBottom, navbarHeight);
		document.documentElement.style.setProperty('--vc', `${window.innerHeight * 0.01}px`);
		document.documentElement.style.setProperty('--footer-height', `${footerHeight + 15}px`);
		document.documentElement.style.setProperty('--navbar-height', `${navbarHeight}px`);
		document.documentElement.style.setProperty('--container-top', `${topperBottom + 30}px`);

		let prevScrollPos = container.scrollTop;
		// on scroll down, add a className to the top container
		// container.addEventListener('scroll', (e) => {
		// 	console.log('scrolling');
		// 	const currentScrollPos = container.scrollTop;
		// 	if (currentScrollPos > prevScrollPos + 50) {
		// 		topper?.classList.add('toggle-up');
		// 		navbar?.classList.add('blur-in');
		// 		prevScrollPos = currentScrollPos;
		// 	} else if (currentScrollPos < prevScrollPos - 50) {
		// 		topper?.classList.remove('toggle-up');
		// 		navbar?.classList.remove('blur-in');
		// 		prevScrollPos = currentScrollPos;
		// 	} else if (currentScrollPos == 0) {
		// 		topper?.classList.remove('toggle-up');
		// 		navbar?.classList.remove('blur-in');
		// 		prevScrollPos = currentScrollPos;
		// 	}
		// });

		// if (topperBottom && top < 0) {
		//   topper?.classList.add("sticky");
		//   navbar?.classList.add("sticky");
		// } else {
		//   topper?.classList.remove("sticky");
		//   navbar?.classList.remove("sticky");
		// }
	}, 0);
}

export function formatDate(date: Date) {
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);

	const dateToFormat = new Date(date);
	const isToday = dateToFormat.toDateString() === today.toDateString();
	const isYesterday = dateToFormat.toDateString() === yesterday.toDateString();

	if (isToday) {
		return 'Today';
	} else if (isYesterday) {
		return 'Yesterday';
	} else {
		return dateToFormat.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
}
