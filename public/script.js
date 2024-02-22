$(document).ready(function() {
    // Function to clear file inputs specifically, as they carry the previous payload
    function clearFileInputs() {
        $('input[type="file"]').val('');
    }

    // Remove any existing modal trigger button and close any existing modal
    $('#modalTriggerBtn').remove();
    $('.modal').modal('hide');

    // Function to add modal trigger button for MSRP
    const addModalTriggerBtn = () => {
        const btnHtml = '<button type="button" class="btn btn-info btn-sm mt-2" id="modalTriggerBtn" data-toggle="modal" data-target="#infoModal">MSRP Brand Support & Maintenance Info</button>';
        $(btnHtml).insertAfter('#optionInfo');
    };

    // Function to update the required attributes based on the visibility of sections
    function updateRequiredAttributes() {
        // For image fields
        $('#imageFields input, #imageFields select').prop('required', $('#imageFields').is(':visible'));

        // For MSRP fields
        $('#msrpFields input, #msrpFields select').prop('required', $('#msrpFields').is(':visible'));

        // Clear required attributes for input fields in hidden sections
        $('.hidden input, .hidden select').prop('required', false);
    }

    $('#optionSelection').change(function() {
        // Clear file inputs to remove previous payloads
        clearFileInputs();

        // Hide all sections first
        $('.hidden').hide();

        // Clear previous option info
        $('#optionInfo').text('');

        const selectedOption = $(this).val();
        switch (selectedOption) {
            case 'Image':
                $('#imageFields').show();
                $('#modalTriggerBtn').remove();
                $('.modal').modal('hide');
                break;
            case 'MSRP':
                $('#msrpFields').show();
                addModalTriggerBtn(); // Add modal trigger button for MSRP
                break;
            case 'Image & MSRP (Lite)':
            case 'Image & MSRP (Pro)':
                // Prevent interaction with these options by immediately reverting to a default state
                // Optionally, display a message or perform another action indicating these options are not available
                $(this).val(''); // Reset selection
                alert('This option is not available.'); // For demonstration; replace with desired feedback mechanism
                $('#modalTriggerBtn').remove();
                break;
        }

        // Dynamically update required attributes based on what is currently visible
        updateRequiredAttributes();

        // Dynamically enable the submit button if a valid option is selected
        $('button[type="submit"]').prop('disabled', !$(this).val());
    });

    // Initial trigger to set up the form correctly on page load
    $('#optionSelection').trigger('change');
});
