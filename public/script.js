// Common functionalities
document.addEventListener("DOMContentLoaded", function () {
    const preloadCheckbox = document.querySelector('.form-check-input[type="checkbox"]');
    const dropdown = document.getElementById('inputGroupSelect02');
    const skuInput = document.getElementById('searchColImage');
    const brandInput = document.getElementById('brandColImage');
    const imageColumnInput = document.getElementById('imageColumnImage');
    const colorInput = document.getElementById('ColorColImage');
    const categoryInput = document.getElementById('CategoryColImage');

    function updateInputs() {
        const selectedOption = dropdown.value;
        const [imageColumn, sku, brand] = selectedOption.split(' ');
        imageColumnInput.value = imageColumn;
        searchColImage.value = sku;
        brandColImage.value = brand;
    }

    function clearInputs() {
        imageColumnInput.value = '';
        skuInput.value = '';
        brandInput.value = '';
        colorInput.value = '';
        categoryInput.value = '';
        
    }

    preloadCheckbox.addEventListener('change', function() {
        if(this.checked) {
            updateInputs();
        } else {
            clearInputs();
        }
    });

    dropdown.addEventListener('change', function() {
        if(preloadCheckbox.checked) {
            updateInputs();
        }
    });// Sidebar toggle for mobile devices
    $('.navbar-toggler').click(function () {
        $('.sidebar').toggleClass('active');
        $('.content').toggleClass('active');
    });

    // Example modal and form reset
    $('#yourButtonId').click(function () {
        $('#yourModalId').modal('show');
    });

    var offcanvasElementList = [].slice.call(document.querySelectorAll('.offcanvas'));
    var offcanvasList = offcanvasElementList.map(function (offcanvasEl) {
        return new bootstrap.Offcanvas(offcanvasEl);
    });

    // Clear form inputs on page load
    $('form').each(function () {
        this.reset();
    });

    // Custom Bootstrap validation style application
    (function () {
        'use strict';
        var forms = document.querySelectorAll('.needs-validation');
        Array.prototype.slice.call(forms).forEach(function (form) {
            form.addEventListener('submit', function (event) {
                if (!form.checkValidity()) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                form.classList.add('was-validated');
            }, false);
        });
    })();
});

function showToast(title, htmlMessage, isSuccess, containerId) {
    const toastContainer = document.getElementById(containerId);
    if (!toastContainer) {
        console.error('Toast container not found:', containerId);
        return;
    }
    // Example paths to your images/icons
    const successIcon = 'img/check.svg'; // Update with your success icon path
    const errorIcon = 'img/alert-triangle.svg'; // Update with your error icon path
    const iconUrl = isSuccess ? successIcon : errorIcon;

    const toastHtml = `
        <div class="toast show align-items-center" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <img src="${iconUrl}" class="toast-icon me-2" alt="${isSuccess ? 'Success' : 'Error'}">
                <div class="toast-body">
                    <strong>${title}</strong><br>${htmlMessage}
                </div>
                <button type="button" class="btn-close ms-auto me-2" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;

    const toastElement = document.createElement('div');
    toastElement.innerHTML = toastHtml;
    toastContainer.appendChild(toastElement);

    // Bootstrap 5 toast initialization
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
}


// Form Submission Handler
// function handleSubmit(formId, submitBtnId, endpoint, toastContainerId) {
//     const form = document.getElementById(formId);
//     if (!form) {
//         console.error('Form not found:', formId);
//         return;
//     }
    
//     const submitBtn = document.getElementById(submitBtnId);
//     form.addEventListener('submit', function (e) {
//         e.preventDefault();
//         if (!form.checkValidity()) {
//             showToast('Error', 'Please fill out all required fields correctly.', false, toastContainerId);
//             return;
//         }

//         submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Loading...';
//         submitBtn.disabled = true;

//         fetch(endpoint, {
//             method: 'POST',
//             body: new FormData(form),
//         })
//         .then(response => response.json())
//         .then(data => {
//             showToast(data.success ? 'Success' : 'Error', data.message, data.success, toastContainerId);
//             submitBtn.innerHTML = 'Submit form';
//             submitBtn.disabled = false;
//             if (data.success) {
//                 form.reset(); // Reset the form fields
//                 form.classList.remove('was-validated'); // Remove validation state
//                 // Optionally clear custom validation messages
//                 Array.from(form.getElementsByClassName('invalid-feedback')).forEach((element) => {
//                     element.textContent = '';
//                 });
//             }
//         })
//         .catch(error => {
//             showToast('Error', error.toString(), false, toastContainerId);
//             submitBtn.innerHTML = 'Submit form';
//             submitBtn.disabled = false;
//         });
//     });
// }
//WORKING BELOW FEB 22

// function handleSubmit(formId, submitBtnId, endpoint, toastContainerId) {
//     const form = document.getElementById(formId);
//     if (!form) {
//         console.error('Form not found:', formId);
//         return;
//     }

//     const submitBtn = document.getElementById(submitBtnId);
//     form.addEventListener('submit', function(e) {
//         e.preventDefault();

//         // Check form validity
//         if (!form.checkValidity()) {
//             showToast('Error', 'Please fill out all required fields correctly.', false, toastContainerId);
//             form.classList.add('was-validated');
//             return;
//         }

//         submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Loading...';
//         submitBtn.disabled = true;

//         fetch(endpoint, {
//             method: 'POST',
//             body: new FormData(form),
//         })
//         .then(response => response.json())
//         .then(data => {
//             // Remove the generic "Error" prefix and use the detailed message directly
//             if (!data.success) {
//                 let errorMessage = data.message; // Directly use the error message from the server
//                 if (data.errors && data.errors.length) {
//                     // Append the first error to the message and note if there are additional errors
//                     errorMessage += `<br>First error: ${data.errors[0]}`;
//                     if (data.errors.length > 1) {
//                         errorMessage += `<br>... and ${data.errors.length - 1} more errors found.`;
//                     }
//                 }
//                 showToast('Error', errorMessage, false, toastContainerId);
//             } else {
//                 showToast('Success', data.message, true, toastContainerId);
//                 form.reset(); // Reset form fields on success
//                 form.classList.remove('was-validated'); // Remove validation visuals
//             }
//         })
//         .catch(error => {
//             // This catch is for network errors or issues with the fetch itself, not server-side application errors
//             showToast('Error', 'An unexpected network error occurred. Please try again. \n'+error, false, toastContainerId);
//         })
//         .finally(() => {
//             submitBtn.innerHTML = 'Submit Form';
//             submitBtn.disabled = false; // Re-enable the submit button
//         });
//     });
// }
function handleSubmit(formId, submitBtnId, endpoint, toastContainerId) {
    const form = document.getElementById(formId);
    const submitBtn = document.getElementById(submitBtnId);
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        if (!form.checkValidity()) {
            showToast('Error', 'Please fill out all required fields correctly.', false, toastContainerId);
            form.classList.add('was-validated');
            return;
        }

        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Loading...';
        submitBtn.disabled = true;

        fetch(endpoint, {
            method: 'POST',
            body: new FormData(form),
        })
        .then(async response => {
            const data = await response.json(); // Attempt to parse the response as JSON
            if (!response.ok) {
                // If server responded with an error status, handle it here
                let errorMessage = data.message || "An error occurred.";
                if (data.errors && data.errors.length) {
                    //errorMessage += ` ${data.errors.join(" ")}`;
                    errorMessage += `<br>First error: ${data.errors[0]}`;
                     if (data.errors.length > 1) {
                         errorMessage += `<br>... and ${data.errors.length - 1} more errors found.`;
                    }
                }
                throw new Error(errorMessage); // Create a new error to be caught by the catch block
            }
            return data; // Pass the successful response data to the next then block
        })
        .then(data => {
            // Handle successful response
            showToast('Success', data.message, true, toastContainerId);
            form.reset();
            form.classList.remove('was-validated');
        })
        .catch(error => {
            // Handle both fetch errors and application errors here
            showToast('Error', error.message, false, toastContainerId);
        })
        .finally(() => {
            submitBtn.innerHTML = 'Submit Form';
            submitBtn.disabled = false;
        });
    });
}
